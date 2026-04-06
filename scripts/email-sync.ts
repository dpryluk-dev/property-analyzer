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
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;
  hoaFee: number;
  taxAnnual: number;
  type: string;
  listingUrl: string;
  source: string;
  subject: string;
  scraped: boolean;
  scrapeError?: string;
}

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
void BASE_URL;

// --- ScraperAPI helpers ---

async function fetchViaScraperAPI(url: string): Promise<string> {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) throw new Error('SCRAPER_API_KEY not set in .env');

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    premium: 'true',
    render: 'true',
    country_code: 'us',
  });

  const resp = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
    signal: AbortSignal.timeout(90000),
  });

  if (!resp.ok) {
    throw new Error(`ScraperAPI ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
  }
  return await resp.text();
}

function parseZillowHtml(html: string): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // Helper to decode HTML entities
  const decode = (s: string) => s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

  // 1. og:title — format: "531 Main St #403M, Worcester, MA 01608 | MLS #73459981 | Zillow"
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];

  if (ogTitle) {
    const decoded = decode(ogTitle);
    // "ADDRESS, CITY, STATE ZIP | ..."
    const addrMatch = decoded.match(/^([^,]+),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})/);
    if (addrMatch) {
      result.address = addrMatch[1].trim();
      result.city = addrMatch[2].trim();
      result.state = addrMatch[3];
      result.zip = addrMatch[4];
    }
  }

  // 2. meta description — format: "Zillow has X photos of this $PRICE N beds, M baths, SQFT Square Feet TYPE home located at ADDRESS built in YEAR..."
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1];

  if (metaDesc) {
    const decoded = decode(metaDesc);

    const priceMatch = decoded.match(/\$\s*([\d,]+)/);
    if (priceMatch) result.price = parseInt(priceMatch[1].replace(/,/g, ''));

    const bedsMatch = decoded.match(/(\d+)\s*beds?/i);
    if (bedsMatch) result.bedrooms = parseInt(bedsMatch[1]);

    const bathsMatch = decoded.match(/([\d.]+)\s*baths?/i);
    if (bathsMatch) result.bathrooms = parseFloat(bathsMatch[1]);

    const sqftMatch = decoded.match(/([\d,]+)\s*Square\s*Feet/i);
    if (sqftMatch) result.sqft = parseInt(sqftMatch[1].replace(/,/g, ''));

    const yearMatch = decoded.match(/built\s*in\s*(\d{4})/i);
    if (yearMatch) result.yearBuilt = parseInt(yearMatch[1]);

    if (/condo/i.test(decoded)) result.type = 'Condo';
    else if (/single.?family/i.test(decoded)) result.type = 'Single Family';
    else if (/townho/i.test(decoded)) result.type = 'Townhouse';
    else if (/multi.?family/i.test(decoded)) result.type = 'Multi-Family';

    // If og:title didn't give us the address, try extracting from description
    if (!result.address) {
      const locMatch = decoded.match(/located\s*at\s*([^,]+),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})/i);
      if (locMatch) {
        result.address = locMatch[1].trim();
        result.city = locMatch[2].trim();
        result.state = locMatch[3];
        result.zip = locMatch[4];
      }
    }
  }

  // 3. __NEXT_DATA__ — dig for HOA, tax, and anything else still missing
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const findProperty = (obj: any, depth = 0): any => {
        if (!obj || depth > 15 || typeof obj !== 'object') return null;
        if (obj.hdpUrl || obj.zpid || (obj.price && obj.bedrooms !== undefined)) return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findProperty(item, depth + 1);
            if (found) return found;
          }
        } else {
          for (const key in obj) {
            const found = findProperty(obj[key], depth + 1);
            if (found) return found;
          }
        }
        return null;
      };

      const prop = findProperty(nextData);
      if (prop) {
        if (!result.price && prop.price) result.price = typeof prop.price === 'number' ? prop.price : parseFloat(prop.price);
        if (!result.bedrooms && prop.bedrooms) result.bedrooms = prop.bedrooms;
        if (!result.bathrooms && prop.bathrooms) result.bathrooms = prop.bathrooms;
        if (!result.sqft && (prop.livingArea || prop.livingAreaValue)) {
          result.sqft = prop.livingArea || prop.livingAreaValue;
        }
        if (!result.yearBuilt && prop.yearBuilt) result.yearBuilt = prop.yearBuilt;
        if (prop.monthlyHoaFee || prop.hoaFee) result.hoaFee = prop.monthlyHoaFee || prop.hoaFee;
        if (prop.propertyTaxRate && (result.price || prop.price)) {
          result.taxAnnual = Math.round((result.price || prop.price) * prop.propertyTaxRate / 100);
        }
        if (!result.address && prop.address) {
          result.address = prop.address.streetAddress || result.address;
          result.city = prop.address.city || result.city;
          result.state = prop.address.state || result.state;
          result.zip = prop.address.zipcode || result.zip;
        }
      }
    } catch {}
  }

  // 4. Regex fallbacks for HOA / tax
  if (!result.hoaFee) {
    const m = html.match(/"monthlyHoaFee"\s*:\s*(\d+)/) || html.match(/HOA[^$]{0,50}\$(\d+)\s*\/?\s*mo/i);
    if (m) result.hoaFee = parseInt(m[1]);
  }
  if (!result.taxAnnual) {
    const m = html.match(/"taxAnnualAmount"\s*:\s*(\d+)/) || html.match(/"annualHomeownersInsurance"\s*:\s*\d+[^}]*?"propertyTaxRate"\s*:\s*([\d.]+)/);
    if (m) {
      const val = parseFloat(m[1]);
      if (val < 10) {
        // It's a rate, convert to annual amount
        if (result.price) result.taxAnnual = Math.round(result.price * val / 100);
      } else {
        result.taxAnnual = val;
      }
    }
  }

  return result;
}

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

  // Extract listing data: start from URL slug + email, then enrich via ScraperAPI
  const useScraper = !!process.env.SCRAPER_API_KEY;
  if (useScraper) {
    console.log(`\n🔍 Enriching ${unique.length} listings via ScraperAPI (this can take a few minutes)...`);
  } else {
    console.log(`\n⚠️  SCRAPER_API_KEY not set — using basic data only (no HOA, tax, year built)`);
  }

  for (let i = 0; i < unique.length; i++) {
    const canonical = unique[i];
    const ctx = canonicalToEmail.get(canonical);
    const subject = ctx?.subject || '';
    const body = ctx?.body || '';

    // Defaults from URL slug
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
    }

    // Price from email body as fallback
    let price = 0;
    const priceInBody = body.match(/\$\s*([\d,]{5,})/);
    if (priceInBody) price = parseInt(priceInBody[1].replace(/,/g, '')) || 0;

    let bedrooms = parseInt(body.match(/(\d+)\s*bd\b/i)?.[1] || '0') || 0;
    let bathrooms = parseFloat(body.match(/([\d.]+)\s*ba\b/i)?.[1] || '0') || 0;
    let sqft = parseInt((body.match(/([\d,]+)\s*sqft/i)?.[1] || '0').replace(/,/g, '')) || 0;
    let yearBuilt = 0;
    let hoaFee = 0;
    let taxAnnual = 0;
    let type = 'Condo';
    let scraped = false;
    let scrapeError: string | undefined;

    // Enrich via ScraperAPI
    if (useScraper) {
      process.stdout.write(`   [${i + 1}/${unique.length}] ${canonical.substring(0, 70)}... `);
      try {
        const html = await fetchViaScraperAPI(canonical);
        const parsed = parseZillowHtml(html);

        if (parsed.address) address = parsed.address;
        if (parsed.city) city = parsed.city;
        if (parsed.state) state = parsed.state;
        if (parsed.zip) zip = parsed.zip;
        if (parsed.price && parsed.price > 0) price = parsed.price;
        if (parsed.bedrooms) bedrooms = parsed.bedrooms;
        if (parsed.bathrooms) bathrooms = parsed.bathrooms;
        if (parsed.sqft) sqft = parsed.sqft;
        if (parsed.yearBuilt) yearBuilt = parsed.yearBuilt;
        if (parsed.hoaFee !== undefined) hoaFee = parsed.hoaFee;
        if (parsed.taxAnnual) taxAnnual = parsed.taxAnnual;
        if (parsed.type) type = parsed.type;
        scraped = true;
        console.log(`✅ ${address || 'unknown'} — $${price.toLocaleString()}${hoaFee ? ` · HOA $${hoaFee}/mo` : ''}`);
      } catch (e: any) {
        scrapeError = e?.message?.substring(0, 150) || String(e);
        console.log(`❌ ${scrapeError}`);
      }
    }

    const zpid = zpidOf(canonical);

    extractedListings.push({
      address: address || 'Unknown',
      city: city || 'Unknown',
      state,
      zip,
      price,
      bedrooms,
      bathrooms,
      sqft,
      yearBuilt,
      hoaFee,
      taxAnnual,
      type,
      listingUrl: canonical,
      source: scraped ? 'Zillow (scraped)' : 'Zillow Email (basic)',
      subject: subject + (zpid ? ` [zpid:${zpid}]` : ''),
      scraped,
      scrapeError,
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
