#!/usr/bin/env tsx
/**
 * Email Listing Sync Script
 *
 * Fetches property listing emails via Gmail API and imports them
 * into the property analyzer.
 *
 * Setup:
 *   1. Create a Google Cloud project and enable Gmail API
 *   2. Create OAuth2 credentials (Desktop app type)
 *   3. Set environment variables:
 *      - GMAIL_CLIENT_ID
 *      - GMAIL_CLIENT_SECRET
 *      - GMAIL_REFRESH_TOKEN
 *   4. Run: npx tsx scripts/email-sync.ts
 *
 * Options:
 *   --days N       Look back N days (default: 3)
 *   --dry-run      Parse emails but don't import
 *   --query "..."  Custom Gmail search query
 */

import { extractListingUrls } from '../src/lib/email-listing-parser';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

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
    '(subject:listing OR subject:property OR subject:home OR subject:"new on market" OR subject:"price reduced" OR subject:"just listed" OR subject:alert)',
    '(from:zillow OR from:redfin OR from:realtor.com OR from:trulia OR from:homes.com OR from:compass OR from:mls OR from:coldwell OR from:keller OR from:remax)',
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

  // Fetch each email and collect listing URLs
  const allUrls: string[] = [];

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

    const urls = extractListingUrls(body);
    if (urls.length > 0) {
      console.log(`   📬 ${subject.substring(0, 60)} (from: ${from.substring(0, 40)})`);
      console.log(`      → ${urls.length} listing URL(s) found`);
      allUrls.push(...urls);
    }
  }

  // Deduplicate URLs
  const unique = Array.from(new Set(allUrls));

  console.log(`\n📊 Summary: ${unique.length} unique listing URLs from ${messageIds.length} emails\n`);

  if (unique.length === 0) {
    console.log('No listing URLs found. Emails may use unsupported formats.');
    return;
  }

  // Print URLs
  for (const url of unique) {
    console.log(`   🔗 ${url.substring(0, 120)}${url.length > 120 ? '...' : ''}`);
  }
  console.log('');

  if (dryRun) {
    console.log('🏁 Dry run complete. Use without --dry-run to fetch pages and import.');
    return;
  }

  // Import via API — the server fetches each URL, extracts page text, and analyzes
  console.log('📥 Fetching each listing page and importing...');
  const resp = await fetch(`${BASE_URL}/api/email-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: unique }),
  });

  if (!resp.ok) {
    console.error(`❌ Import failed: ${resp.status} ${await resp.text()}`);
    return;
  }

  const result = await resp.json();
  console.log(`\n✅ Done!`);
  console.log(`   Imported: ${result.imported}`);
  console.log(`   Skipped (duplicates): ${result.skipped}`);
  if (result.errors?.length > 0) {
    console.log(`   Errors:`);
    for (const err of result.errors) {
      console.log(`     ⚠️  ${err}`);
    }
  }
}

main().catch(e => {
  console.error(`\n❌ Error: ${e.message}`);
  process.exit(1);
});
