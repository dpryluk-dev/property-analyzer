#!/usr/bin/env tsx
/**
 * Email Listing Sync Script
 *
 * Fetches property listing emails via Gmail API and imports them
 * into the property analyzer. Self-contained — no dev server required.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local in addition to --env-file=.env so we pick up Next.js
// database URLs etc. that may only be in .env.local.
function loadEnvFile(file: string) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.substring(0, eq).trim();
      let val = trimmed.substring(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnvFile(path.resolve('.env.local'));
loadEnvFile(path.resolve('.env'));

import { extractListingUrls } from '../src/lib/email-listing-parser';
import { importListingFromUrl, analyzeProperty } from '../src/lib/actions';
import prisma from '../src/lib/db';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
void BASE_URL; // unused now that we call actions directly

// --- Gmail API helpers ---

interface GmailTokens {
  access_token: string;
  expires_in: number;
}

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Gmail credentials. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.\n' +
      'See: https://developers.google.com/gmail/api/quickstart/nodejs'
    );
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to refresh token: ${resp.status} ${await resp.text()}`);
  }

  const data: GmailTokens = await resp.json();
  return data.access_token;
}

async function gmailFetch(accessToken: string, endpoint: string) {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Gmail API error: ${resp.status} ${await resp.text()}`);
  }

  return resp.json();
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractTextFromParts(parts: any[]): string {
  let text = '';

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data) + '\n';
    } else if (part.mimeType === 'text/html' && part.body?.data && !text) {
      // Strip HTML tags as fallback
      const html = decodeBase64Url(part.body.data);
      text += html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ') + '\n';
    } else if (part.parts) {
      text += extractTextFromParts(part.parts);
    }
  }

  return text;
}

function canonicalizeListingUrl(url: string): string {
  // Zillow: dedupe by zpid
  const zpid = url.match(/(\d+)_zpid/)?.[1];
  if (zpid && /zillow\.com/i.test(url)) {
    return `https://www.zillow.com/homedetails/${zpid}_zpid/`;
  }
  // Redfin: dedupe by /home/NUMBER
  const redfinId = url.match(/redfin\.com\/.*?\/home\/(\d+)/i)?.[1];
  if (redfinId) {
    return `https://www.redfin.com/home/${redfinId}`;
  }
  // Default: strip query string and fragment
  return url.split('?')[0].split('#')[0];
}

async function resolveTrackingUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return resp.url || url;
  } catch {
    return url;
  }
}

async function resolveAndDedupe(urls: string[]): Promise<string[]> {
  process.stdout.write(`   Resolving ${urls.length} tracking URLs`);

  const resolved = await Promise.all(
    urls.map(async (u, i) => {
      const r = await resolveTrackingUrl(u);
      if (i % 10 === 0) process.stdout.write('.');
      return canonicalizeListingUrl(r);
    }),
  );

  process.stdout.write(' done\n');

  // Only keep URLs that look like actual listing detail pages
  const listingUrls = resolved.filter(u =>
    /zillow\.com\/homedetails\/|redfin\.com\/home\/|realtor\.com\/realestateandhomes-detail\//i.test(u),
  );

  return Array.from(new Set(listingUrls));
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 3 : 3;
  const queryIdx = args.indexOf('--query');
  const customQuery = queryIdx >= 0 ? args[queryIdx + 1] : null;

  console.log(`\n📧 Email Listing Sync`);
  console.log(`   Looking back: ${days} days`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('');

  // Build Gmail search query
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - days);
  const afterStr = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;

  const query = customQuery || [
    `after:${afterStr}`,
    '(subject:listing OR subject:property OR subject:home OR subject:"new on market" OR subject:"price reduced" OR subject:"just listed" OR subject:alert OR "MLS #" OR "List Price")',
    '(from:zillow OR from:redfin OR from:realtor.com OR from:trulia OR from:homes.com OR from:compass OR from:mls OR from:coldwell OR from:keller OR from:remax OR from:mlspin OR from:flexmls OR from:matrix OR from:paragon OR from:rappattoni OR from:ntreis OR from:stellar)',
  ].join(' ');

  console.log(`   Query: ${query}\n`);

  // Authenticate
  console.log('🔑 Authenticating with Gmail...');
  const accessToken = await refreshAccessToken();
  console.log('   ✓ Authenticated\n');

  // Search for matching emails
  console.log('🔍 Searching for listing emails...');
  const searchResult = await gmailFetch(accessToken, `messages?q=${encodeURIComponent(query)}&maxResults=50`);
  const messageIds: string[] = (searchResult.messages || []).map((m: any) => m.id);
  console.log(`   Found ${messageIds.length} matching emails\n`);

  if (messageIds.length === 0) {
    console.log('No listing emails found. Try adjusting --days or --query.');
    return;
  }

  // Fetch each email; collect URLs from aggregator emails and raw MLS text from MLS emails
  const allUrls: string[] = [];
  const mlsBodies: { subject: string; body: string }[] = [];

  for (const msgId of messageIds) {
    const msg = await gmailFetch(accessToken, `messages/${msgId}?format=full`);

    const subject = msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const from = msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';

    let body = '';
    if (msg.payload?.body?.data) {
      body = decodeBase64Url(msg.payload.body.data);
    } else if (msg.payload?.parts) {
      body = extractTextFromParts(msg.payload.parts);
    }

    if (!body) continue;

    // Detect MLS-format content in the email body
    // MLS emails typically include "MLS #", "List Price", "Total Rooms", "Living Area" etc.
    const mlsSignals = [
      /MLS\s*#/i,
      /List\s*Price/i,
      /Living\s*Area/i,
      /Total\s*Rooms/i,
      /Year\s*Built/i,
      /Bedrooms?\s*:/i,
    ];
    const mlsSignalCount = mlsSignals.filter(p => p.test(body)).length;

    if (mlsSignalCount >= 3) {
      console.log(`   📬 ${subject.substring(0, 60)} (from: ${from.substring(0, 40)})`);
      console.log(`      → MLS-format listing detected`);
      mlsBodies.push({ subject, body });
      continue;
    }

    // Otherwise treat as aggregator email (Zillow, Redfin, etc.) and extract URLs
    const urls = extractListingUrls(body);
    if (urls.length > 0) {
      console.log(`   📬 ${subject.substring(0, 60)} (from: ${from.substring(0, 40)})`);
      console.log(`      → ${urls.length} tracking URL(s) found`);
      allUrls.push(...urls);
    }
  }

  // Resolve aggregator tracking URLs to final listing URLs
  let unique: string[] = [];
  if (allUrls.length > 0) {
    const rawUnique = Array.from(new Set(allUrls));
    console.log(`\n🔗 Found ${rawUnique.length} tracking URLs. Resolving...`);
    unique = await resolveAndDedupe(rawUnique);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ${unique.length} unique listings (from aggregator emails)`);
  console.log(`   ${mlsBodies.length} MLS-format emails\n`);

  if (unique.length === 0 && mlsBodies.length === 0) {
    console.log('No listings found. Try adjusting --days or --query.');
    return;
  }

  // Print URLs
  for (const url of unique) {
    console.log(`   🔗 ${url}`);
  }
  for (const m of mlsBodies) {
    console.log(`   📄 MLS: ${m.subject.substring(0, 80)}`);
  }
  console.log('');

  if (dryRun) {
    console.log('🏁 Dry run complete. Use without --dry-run to fetch pages and import.');
    return;
  }

  let totalImported = 0;
  const allErrors: string[] = [];

  // Import aggregator URLs — call the action directly (no HTTP, no dev server)
  if (unique.length > 0) {
    console.log(`📥 Importing ${unique.length} Zillow listings (via Claude web search)...`);
    console.log(`   (Pacing at ~1 request per 8 seconds to stay under rate limits)\n`);

    for (let i = 0; i < unique.length; i++) {
      const url = unique[i];
      process.stdout.write(`   [${i + 1}/${unique.length}] ${url.substring(0, 70)}... `);

      let attempt = 0;
      let success = false;

      while (attempt < 3 && !success) {
        attempt++;
        try {
          const result = await importListingFromUrl(url);
          if (result.success && result.property) {
            totalImported++;
            console.log(`✅ ${result.property.address || 'imported'}`);
            success = true;
          } else {
            const err = result.error || 'unknown';
            // Retry on rate limit
            if (/429|rate.?limit/i.test(err) && attempt < 3) {
              console.log(`⏳ rate limited, waiting 60s...`);
              await new Promise(r => setTimeout(r, 60000));
              process.stdout.write(`      retry ${attempt}... `);
              continue;
            }
            allErrors.push(`${url}: ${err}`);
            console.log(`❌ ${err.substring(0, 100)}`);
            break;
          }
        } catch (e: any) {
          const msg = e?.message || String(e);
          if (/429|rate.?limit/i.test(msg) && attempt < 3) {
            console.log(`⏳ rate limited, waiting 60s...`);
            await new Promise(r => setTimeout(r, 60000));
            process.stdout.write(`      retry ${attempt}... `);
            continue;
          }
          allErrors.push(`${url}: ${msg}`);
          console.log(`❌ ${msg.substring(0, 100)}`);
          break;
        }
      }

      // Pace requests to avoid hitting the 30k tokens/min limit
      if (i < unique.length - 1) {
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  }

  // Import MLS-format emails — split on MLS IDs and analyze each chunk
  if (mlsBodies.length > 0) {
    console.log(`\n📥 Importing ${mlsBodies.length} MLS-format email(s)...`);
    for (const m of mlsBodies) {
      // Split on MLS ID markers if multiple listings in one email
      const text = m.body;
      const mlsIdRegex = /MLS\s*#?\s*:?\s*(\d{6,})/gi;
      const mlsMatches = Array.from(text.matchAll(mlsIdRegex)) as RegExpMatchArray[];

      const chunks: string[] = [];
      if (mlsMatches.length > 1) {
        for (let i = 0; i < mlsMatches.length; i++) {
          const start = mlsMatches[i].index!;
          const end = i + 1 < mlsMatches.length ? mlsMatches[i + 1].index! : text.length;
          chunks.push(text.substring(Math.max(0, start - 500), end));
        }
      } else {
        chunks.push(text);
      }

      for (const chunk of chunks) {
        if (!/\$\s*[\d,]{4,}|list\s*price/i.test(chunk)) continue;

        // Dedupe by MLS ID
        const mlsIdMatch = chunk.match(/MLS\s*#?\s*:?\s*(\d{6,})/i);
        if (mlsIdMatch) {
          const existing = await prisma.property.findFirst({ where: { mlsId: mlsIdMatch[1] } });
          if (existing) {
            console.log(`   ⏭️  Skipped (already imported): MLS #${mlsIdMatch[1]}`);
            continue;
          }
        }

        try {
          const property = await analyzeProperty(chunk);
          totalImported++;
          console.log(`   ✅ ${property.address || 'MLS listing'} — $${property.listPrice?.toLocaleString?.() || '?'}`);
        } catch (e: any) {
          const msg = e?.message || String(e);
          allErrors.push(`MLS chunk: ${msg}`);
          console.log(`   ❌ ${msg}`);
        }
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Imported: ${totalImported}`);
  if (allErrors.length > 0) {
    console.log(`   Errors:`);
    for (const err of allErrors) {
      console.log(`     ⚠️  ${err}`);
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    await prisma.$disconnect();
    console.error(`\n❌ Error: ${e.message}`);
    process.exit(1);
  });
