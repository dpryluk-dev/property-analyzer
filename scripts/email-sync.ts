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

interface ExtractedListing {
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  listingUrl: string;
  source: string;
  subject: string;
}

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
  // Zillow: keep the full slug form (for address extraction) but strip query string
  if (/zillow\.com\/homedetails/i.test(url)) {
    return url.split('?')[0].split('#')[0];
  }
  const redfinId = url.match(/redfin\.com\/.*?\/home\/(\d+)/i)?.[1];
  if (redfinId) {
    return url.split('?')[0].split('#')[0];
  }
  return url.split('?')[0].split('#')[0];
}

function zpidOf(url: string): string | null {
  return url.match(/(\d+)_zpid/)?.[1] || null;
}

/**
 * Parse address details from a Zillow homedetails URL slug.
 * Example: /homedetails/531-Main-St-403M-Worcester-MA-01608/64482035_zpid/
 * Returns: { address: "531 Main St 403M", city: "Worcester", state: "MA", zip: "01608" }
 */
function parseZillowSlug(url: string): {
  address: string;
  city: string;
  state: string;
  zip: string;
} | null {
  // Match the segment between /homedetails/ and /ZPID_zpid/
  const m = url.match(/\/homedetails\/([^/]+)\/\d+_zpid/i);
  if (!m) return null;

  const slug = m[1];
  // Slug format: ADDRESS-CITY-STATE-ZIP where words are hyphenated
  // ZIP is 5 digits at the end, STATE is 2 letters before that
  const zipMatch = slug.match(/-(\d{5})$/);
  const zip = zipMatch ? zipMatch[1] : '';
  const withoutZip = zipMatch ? slug.substring(0, slug.length - zipMatch[0].length) : slug;

  const stateMatch = withoutZip.match(/-([A-Z]{2})$/);
  const state = stateMatch ? stateMatch[1] : 'MA';
  const withoutState = stateMatch ? withoutZip.substring(0, withoutZip.length - stateMatch[0].length) : withoutZip;

  // City is tricky because it can be multiple words. Heuristic: walk backward
  // through the remaining hyphen-separated tokens and assume the last 1-3 are the city.
  // Most addresses end in St/Ave/Rd/Dr/Ln/Blvd/Way/Ct/Pl/Cir/Ter or a unit like #X.
  const tokens = withoutState.split('-');

  // Find the last street suffix token working from the front
  const suffixes = new Set([
    'St', 'Ave', 'Rd', 'Dr', 'Ln', 'Blvd', 'Way', 'Ct', 'Pl', 'Cir', 'Ter', 'Pkwy', 'Hwy',
    'Street', 'Avenue', 'Road', 'Drive', 'Lane', 'Boulevard', 'Court', 'Place', 'Circle', 'Terrace',
  ]);

  let streetEndIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (suffixes.has(tokens[i])) {
      streetEndIdx = i;
      // Allow a unit/apt token after the suffix (e.g. "St-403M" or "Ave-Unit-3")
      if (i + 1 < tokens.length && /^(Unit|Apt|#)?\w+$/i.test(tokens[i + 1]) && !/^[A-Z][a-z]+$/.test(tokens[i + 1])) {
        streetEndIdx = i + 1;
      }
    }
  }

  let address: string;
  let city: string;
  if (streetEndIdx >= 0 && streetEndIdx < tokens.length - 1) {
    address = tokens.slice(0, streetEndIdx + 1).join(' ');
    city = tokens.slice(streetEndIdx + 1).join(' ');
  } else {
    // Fallback: last 1-2 tokens are the city
    address = tokens.slice(0, Math.max(1, tokens.length - 1)).join(' ');
    city = tokens.slice(Math.max(1, tokens.length - 1)).join(' ');
  }

  return { address, city, state, zip };
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

  // Fetch each email; collect URLs + extract listing data from subject/body
  const extractedListings: ExtractedListing[] = [];
  const trackingUrlToEmail = new Map<string, { subject: string; body: string }>();

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

    console.log(`   📬 ${subject.substring(0, 70)}`);

    // Find tracking URLs in this email and map them to this email for later lookup
    const urls = extractListingUrls(body);
    for (const u of urls) {
      trackingUrlToEmail.set(u, { subject, body });
    }
  }

  // Collect all tracking URLs
  const allUrls = Array.from(trackingUrlToEmail.keys());

  // Resolve aggregator tracking URLs to final listing URLs
  const canonicalToEmail = new Map<string, { subject: string; body: string }>();
  let unique: string[] = [];
  if (allUrls.length > 0) {
    const rawUnique = Array.from(new Set(allUrls));
    console.log(`\n🔗 Found ${rawUnique.length} tracking URLs. Resolving...`);

    // Resolve each to canonical URL and keep a map of canonical → email context
    for (const tracking of rawUnique) {
      const resolved = await resolveTrackingUrl(tracking);
      const canonical = canonicalizeListingUrl(resolved);
      if (/zillow\.com\/homedetails\/|redfin\.com\/home\/|realtor\.com\/realestateandhomes-detail\//i.test(canonical)) {
        if (!canonicalToEmail.has(canonical)) {
          const emailCtx = trackingUrlToEmail.get(tracking);
          if (emailCtx) canonicalToEmail.set(canonical, emailCtx);
        }
      }
    }
    unique = Array.from(canonicalToEmail.keys());
    console.log(`   ✓ Resolved to ${unique.length} unique listings`);
  }

  // Extract listing data — first try the URL slug (most reliable), then fall back
  // to email subject/body patterns.
  for (const canonical of unique) {
    const ctx = canonicalToEmail.get(canonical);
    const subject = ctx?.subject || '';
    const body = ctx?.body || '';

    // Primary: parse address from the Zillow URL slug
    let address = '';
    let city = '';
    let state = 'MA';
    let zip = '';

    const fromSlug = parseZillowSlug(canonical);
    if (fromSlug) {
      address = fromSlug.address;
      city = fromSlug.city;
      state = fromSlug.state;
      zip = fromSlug.zip;
    } else {
      // Fallback: parse from subject
      const subjectWithAddr = subject.match(/^(?:A|An)\s+([A-Z][a-zA-Z\s]+?)\s+home\s+for\s+you:\s*(.+?)$/i);
      if (subjectWithAddr) {
        city = subjectWithAddr[1].trim();
        address = subjectWithAddr[2].trim();
      }
    }

    // Price: look in email body near the listing URL, then subject, then anywhere
    let price = 0;
    const priceInBody = body.match(/\$\s*([\d,]{5,})/);
    if (priceInBody) price = parseInt(priceInBody[1].replace(/,/g, '')) || 0;
    if (!price) {
      const priceInSubject = subject.match(/\$(\d{2,3})[Kk]\b/);
      if (priceInSubject) price = parseInt(priceInSubject[1]) * 1000;
    }

    // Beds/baths/sqft from body
    const beds = parseInt(body.match(/(\d+)\s*bd\b/i)?.[1] || '0') || 0;
    const baths = parseFloat(body.match(/([\d.]+)\s*ba\b/i)?.[1] || '0') || 0;
    const sqft = parseInt((body.match(/([\d,]+)\s*sqft/i)?.[1] || '0').replace(/,/g, '')) || 0;

    const zpid = zpidOf(canonical);

    extractedListings.push({
      address: address || 'Unknown',
      city: city || 'Unknown',
      state,
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      listingUrl: canonical,
      source: 'Zillow Email',
      subject: subject + (zpid ? ` [zpid:${zpid}${zip ? ` zip:${zip}` : ''}]` : ''),
    });
  }

  // MLS-format emails: find them too
  const mlsBodies: { subject: string; body: string }[] = [];
  // (MLS handling left for later — prioritize the Zillow path first)

  console.log(`\n📊 Summary:`);
  console.log(`   ${extractedListings.length} unique listings extracted\n`);

  if (extractedListings.length === 0) {
    console.log('No listings found. Try adjusting --days or --query.');
    return;
  }

  // Print nicely formatted table
  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  for (const l of extractedListings) {
    console.log(`│ ${l.address.padEnd(35).substring(0, 35)} ${l.city.padEnd(18).substring(0, 18)} $${l.price.toLocaleString().padStart(9)} │`);
    console.log(`│   ${l.bedrooms}bd/${l.bathrooms}ba · ${l.sqft} sqft · ${l.listingUrl.substring(0, 55)}`);
    console.log('├─────────────────────────────────────────────────────────────────────┤');
  }
  console.log('└─────────────────────────────────────────────────────────────────────┘');

  if (dryRun) {
    console.log('\n🏁 Dry run complete. Use without --dry-run to write to scouted-listings.json.');
    return;
  }

  // Write to JSON file — simple, no DB, no API required
  const outputPath = path.resolve('scouted-listings.json');
  let existing: ExtractedListing[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  } catch {}

  // Merge: dedupe by listingUrl
  const byUrl = new Map<string, ExtractedListing>();
  for (const l of existing) byUrl.set(l.listingUrl, l);
  let newCount = 0;
  for (const l of extractedListings) {
    if (!byUrl.has(l.listingUrl)) {
      byUrl.set(l.listingUrl, l);
      newCount++;
    }
  }

  const merged = Array.from(byUrl.values());
  fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Wrote ${merged.length} total listings to: ${outputPath}`);
  console.log(`   New this run: ${newCount}`);
  console.log(`   Skipped (already seen): ${extractedListings.length - newCount}`);
  console.log(`\n💡 Next: Import these into your analyzer.`);
  console.log(`   Run: npx tsx --env-file=.env scripts/import-listings.ts`);
  void mlsBodies;
}

main().catch(e => {
  console.error(`\n❌ Error: ${e.message}`);
  process.exit(1);
});
