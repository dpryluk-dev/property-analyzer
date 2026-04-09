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
import { researchRent } from '../src/lib/rent-research';
import { analyze } from '../src/lib/analysis';
import { parseMLS, type ParsedProperty } from '../src/lib/parser';
import prisma from '../src/lib/db';

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

/**
 * Save a scraped listing as a full Property record with rent research and analysis.
 * Skips if a property with the same listingUrl or address already exists.
 */
async function saveListingToDatabase(listing: ExtractedListing): Promise<{
  skipped?: boolean;
  property?: any;
  error?: string;
}> {
  if (!listing.price || listing.price < 10000) {
    return { error: 'missing price' };
  }

  // Dedupe by listing URL first, then by address
  const byUrl = await prisma.property.findFirst({ where: { listingUrl: listing.listingUrl } });
  if (byUrl) return { skipped: true, property: byUrl };

  if (listing.address && listing.address !== 'Unknown') {
    const byAddr = await prisma.property.findFirst({ where: { address: listing.address } });
    if (byAddr) {
      // Backfill listingUrl
      if (!byAddr.listingUrl) {
        await prisma.property.update({
          where: { id: byAddr.id },
          data: { listingUrl: listing.listingUrl },
        });
      }
      return { skipped: true, property: byAddr };
    }
  }

  // Convert to ParsedProperty shape for analysis
  const parsed: ParsedProperty = {
    address: listing.address || 'Unknown',
    city: listing.city || '',
    state: listing.state || 'MA',
    zip: listing.zip || '',
    type: listing.type || 'Condo',
    mlsId: '',
    complex: '',
    bedrooms: listing.bedrooms || 0,
    bathrooms: listing.bathrooms || 0,
    sqft: listing.sqft || 0,
    yearBuilt: listing.yearBuilt || 0,
    listPrice: listing.price,
    hoaFee: listing.hoaFee || 0,
    hoaIncludes: '',
    taxAnnual: listing.taxAnnual || 0,
    taxYear: 2025,
    assessed: 0,
    parking: 0,
    dom: 0,
  };

  // Research rent via Claude web search — the one field we can't get from
  // ScraperAPI since rent data isn't shown on for-sale listing pages.
  // Falls back to a formula estimate internally if the API errors.
  const rentData = await researchRent(parsed);
  const rent = Number.isFinite(rentData.rent) && rentData.rent > 0 ? rentData.rent : 0;

  // Run ROI analysis
  const result = analyze(parsed, rent, listing.price);

  // Save to DB via Prisma — mirrors analyzeProperty() shape
  const saved = await prisma.property.create({
    include: {
      analysis: true,
      rentResearch: true,
    },
    data: {
      address: parsed.address,
      city: parsed.city || null,
      state: parsed.state,
      zip: parsed.zip || null,
      type: parsed.type,
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      sqft: parsed.sqft,
      yearBuilt: parsed.yearBuilt || null,
      listPrice: parsed.listPrice,
      hoaFee: parsed.hoaFee,
      taxAnnual: parsed.taxAnnual,
      taxYear: parsed.taxYear,
      parking: 0,
      dom: 0,
      rawMls: `[Imported from Zillow via email sync]\n${listing.listingUrl}`.substring(0, 50000),
      listingUrl: listing.listingUrl,
      adjPrice: listing.price,
      adjRent: rent,
      rentResearch: {
        create: {
          rent,
          low: Number.isFinite(rentData.low) ? rentData.low : 0,
          high: Number.isFinite(rentData.high) ? rentData.high : 0,
          confidence: rentData.confidence || 'Low',
          methodology: rentData.methodology || null,
          comps: {
            create: (rentData.comps || []).map(c => ({
              address: String(c.address || 'Unknown'),
              rent: Number.isFinite(c.rent) ? c.rent : 0,
              note: c.note ? String(c.note) : null,
            })),
          },
        },
      },
      analysis: {
        create: {
          priceUsed: listing.price,
          rentUsed: rent,
          totalExpMo: result.totalExpMo,
          netMo: result.netMo,
          capRate: result.capRate,
          expRatio: result.expRatio,
          grm: result.grm,
          breakMo: result.breakMo,
          rating: result.rating,
          expenses: {
            create: result.expenses.map((e, i) => ({
              name: e.name,
              monthly: e.monthly,
              note: e.note,
              sortOrder: i,
            })),
          },
          observations: {
            create: result.observations.map(o => ({
              color: o.color,
              icon: o.icon,
              text: o.text,
            })),
          },
        },
      },
    },
  });

  return { property: saved };
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

      // Walk the ENTIRE object tree looking for HOA and tax keys anywhere.
      // Zillow nests these under hdpData.homeInfo, resoFacts, and other places.
      const hoaCandidates: number[] = [];
      const taxCandidates: number[] = [];
      const taxRateCandidates: number[] = [];
      const walk = (obj: any, depth = 0) => {
        if (!obj || depth > 20 || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) walk(item, depth + 1);
          return;
        }
        for (const key in obj) {
          const val = obj[key];
          if (typeof val === 'number' && val > 0) {
            if (/(^|_)(monthly)?hoa(fee)?($|_)/i.test(key) || /associationfee/i.test(key)) {
              if (val < 5000) hoaCandidates.push(val);
            }
            if (/taxannualamount|annualtax|propertytax(amount|annual)/i.test(key)) {
              if (val > 100 && val < 500000) taxCandidates.push(val);
            }
            if (/propertytaxrate/i.test(key)) {
              if (val > 0 && val < 10) taxRateCandidates.push(val);
            }
          }
          if (typeof val === 'object') walk(val, depth + 1);
        }
      };
      walk(nextData);

      const prop = findProperty(nextData);
      if (prop) {
        if (!result.price && prop.price) result.price = typeof prop.price === 'number' ? prop.price : parseFloat(prop.price);
        if (!result.bedrooms && prop.bedrooms) result.bedrooms = prop.bedrooms;
        if (!result.bathrooms && prop.bathrooms) result.bathrooms = prop.bathrooms;
        if (!result.sqft && (prop.livingArea || prop.livingAreaValue)) {
          result.sqft = prop.livingArea || prop.livingAreaValue;
        }
        if (!result.yearBuilt && prop.yearBuilt) result.yearBuilt = prop.yearBuilt;
        if (!result.address && prop.address) {
          result.address = prop.address.streetAddress || result.address;
          result.city = prop.address.city || result.city;
          result.state = prop.address.state || result.state;
          result.zip = prop.address.zipcode || result.zip;
        }
      }

      // Take the most plausible HOA value (mode or first)
      if (!result.hoaFee && hoaCandidates.length > 0) {
        // Prefer the most-common value
        const counts = new Map<number, number>();
        for (const v of hoaCandidates) counts.set(v, (counts.get(v) || 0) + 1);
        const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
        result.hoaFee = mostCommon[0];
      }

      // Tax: prefer explicit annual amount, else compute from rate
      if (!result.taxAnnual && taxCandidates.length > 0) {
        result.taxAnnual = Math.max(...taxCandidates);
      }
      if (!result.taxAnnual && taxRateCandidates.length > 0 && (result.price || 0) > 0) {
        const rate = taxRateCandidates[0];
        result.taxAnnual = Math.round(result.price! * rate / 100);
      }
    } catch {}
  }

  // 4. Regex fallbacks for HOA / tax on the raw HTML (last resort, picks up
  //    values that are rendered as text only)
  if (!result.hoaFee) {
    const patterns = [
      /"monthlyHoaFee"\s*:\s*(\d+)/,
      /"hoaFee"\s*:\s*(\d+)/,
      /"associationFee"\s*:\s*(\d+)/,
      /HOA[^$]{0,80}\$\s*(\d{2,4})\s*\/?\s*mo/i,
      /HOA\s*(?:fee|dues)[^$]{0,40}\$\s*(\d{2,4})/i,
      /Association\s*Fee[^$]{0,40}\$\s*(\d{2,4})/i,
      /\$\s*(\d{2,4})\s*\/\s*mo\s*HOA/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) {
        const val = parseInt(m[1]);
        if (val > 0 && val < 5000) {
          result.hoaFee = val;
          break;
        }
      }
    }
  }
  if (!result.taxAnnual) {
    const patterns = [
      /"taxAnnualAmount"\s*:\s*(\d+)/,
      /"annualTaxAmount"\s*:\s*(\d+)/,
      /annual\s*tax[^$]{0,50}\$\s*([\d,]+)/i,
      /property\s*tax[^$]{0,30}\$\s*([\d,]+)\s*\/\s*yr/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) {
        const val = parseInt(String(m[1]).replace(/,/g, ''));
        if (val > 100 && val < 500000) {
          result.taxAnnual = val;
          break;
        }
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

async function gmailTrashMessage(accessToken: string, messageId: string): Promise<void> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!resp.ok) {
    throw new Error(`Gmail trash error: ${resp.status} ${await resp.text()}`);
  }
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
  const noTrash = args.includes('--no-trash');
  const skipDb = args.includes('--skip-db');
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

  // Fetch each email; collect URLs + track which message each came from
  const extractedListings: ExtractedListing[] = [];
  const trackingUrlToEmail = new Map<string, { subject: string; body: string; msgId: string }>();
  const messageIdToUrls = new Map<string, Set<string>>(); // msgId -> set of canonical URLs
  const mlsBodies: { subject: string; body: string; msgId: string }[] = [];

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

    // Detect MLS-format emails (pinergy@mlspin.com, Matrix, etc.) by signals
    const mlsSignals = [
      /MLS\s*#\s*\d+/i,
      /List\s*Price\s*[:$]/i,
      /Living\s*Area/i,
      /Total\s*Rooms/i,
      /\bDOM\b/i,
    ];
    const mlsSignalCount = mlsSignals.filter(p => p.test(body)).length;
    const isMls = mlsSignalCount >= 2 || /mlspin\.com/i.test(from);

    if (isMls) {
      console.log(`      → MLS-format email from ${from.substring(0, 40)}`);
      mlsBodies.push({ subject, body, msgId });
      messageIdToUrls.set(msgId, new Set());
      continue;
    }

    const urls = extractListingUrls(body);
    for (const u of urls) {
      trackingUrlToEmail.set(u, { subject, body, msgId });
    }
    messageIdToUrls.set(msgId, new Set());
  }

  const allUrls = Array.from(trackingUrlToEmail.keys());

  // Resolve aggregator tracking URLs to final listing URLs
  const canonicalToEmail = new Map<string, { subject: string; body: string; msgId: string }>();
  let unique: string[] = [];
  if (allUrls.length > 0) {
    const rawUnique = Array.from(new Set(allUrls));
    console.log(`\n🔗 Found ${rawUnique.length} tracking URLs. Resolving...`);

    for (const tracking of rawUnique) {
      const resolved = await resolveTrackingUrl(tracking);
      const canonical = canonicalizeListingUrl(resolved);
      if (/zillow\.com\/homedetails\/|redfin\.com\/home\/|realtor\.com\/realestateandhomes-detail\//i.test(canonical)) {
        if (!canonicalToEmail.has(canonical)) {
          const emailCtx = trackingUrlToEmail.get(tracking);
          if (emailCtx) {
            canonicalToEmail.set(canonical, emailCtx);
            messageIdToUrls.get(emailCtx.msgId)?.add(canonical);
          }
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

  console.log(`\n📊 Summary:`);
  console.log(`   ${extractedListings.length} aggregator listings (Zillow/Redfin)`);
  console.log(`   ${mlsBodies.length} MLS-format emails\n`);

  if (extractedListings.length === 0 && mlsBodies.length === 0) {
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

  // Always write a JSON audit file alongside the DB import
  const outputPath = path.resolve('scouted-listings.json');
  let existing: ExtractedListing[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  } catch {}
  const jsonByUrl = new Map<string, ExtractedListing>();
  for (const l of existing) jsonByUrl.set(l.listingUrl, l);
  for (const l of extractedListings) jsonByUrl.set(l.listingUrl, l);
  fs.writeFileSync(outputPath, JSON.stringify(Array.from(jsonByUrl.values()), null, 2));
  console.log(`\n💾 Wrote ${jsonByUrl.size} listings to ${outputPath}`);

  if (dryRun) {
    console.log('\n🏁 Dry run — stopping before DB import & email trashing.');
    console.log('   Remove --dry-run to run the full pipeline.');
    return;
  }

  // Import each listing into the database (with rent research + analysis).
  // Track which messages successfully had all their listings imported so we
  // can trash only the fully-processed ones.
  const messageImportStatus = new Map<string, { total: number; imported: number; failed: number }>();
  for (const [msgId, urls] of messageIdToUrls.entries()) {
    messageImportStatus.set(msgId, { total: urls.size, imported: 0, failed: 0 });
  }

  let importedCount = 0;
  let skippedCount = 0;
  const importErrors: string[] = [];

  if (!skipDb) {
    console.log(`\n📥 Importing ${extractedListings.length} listings into database (with rent research + ROI analysis)...`);
    console.log(`   Each listing calls Claude web_search for rent comps (~10-20s per listing).\n`);

    for (let i = 0; i < extractedListings.length; i++) {
      const listing = extractedListings[i];
      const ctx = canonicalToEmail.get(listing.listingUrl);
      const msgId = ctx?.msgId;

      process.stdout.write(`   [${i + 1}/${extractedListings.length}] ${(listing.address || 'Unknown').substring(0, 45).padEnd(45)} `);

      try {
        const result = await saveListingToDatabase(listing);
        if (result.skipped) {
          skippedCount++;
          console.log(`⏭️  already in portfolio`);
          if (msgId) messageImportStatus.get(msgId)!.imported++;
        } else if (result.property) {
          importedCount++;
          const p: any = result.property;
          const rating = p.analysis?.rating || '';
          const cap = typeof p.analysis?.capRate === 'number' ? p.analysis.capRate.toFixed(1) : '?';
          const rentVal = p.rentResearch?.rent || p.adjRent || 0;
          console.log(`✅ rent $${rentVal.toLocaleString()} · ${rating} · ${cap}% cap`);
          if (msgId) messageImportStatus.get(msgId)!.imported++;
        } else {
          importErrors.push(`${listing.address || listing.listingUrl}: ${result.error}`);
          console.log(`❌ ${result.error}`);
          if (msgId) messageImportStatus.get(msgId)!.failed++;
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        importErrors.push(`${listing.address || listing.listingUrl}: ${msg}`);
        console.log(`❌ ${msg.substring(0, 80)}`);
        if (msgId) messageImportStatus.get(msgId)!.failed++;

        // Back off on rate limits
        if (/429|rate.?limit/i.test(msg)) {
          console.log(`   ⏳ rate limited, waiting 60s...`);
          await new Promise(r => setTimeout(r, 60000));
        }
      }

      // Small pacing between listings
      if (i < extractedListings.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Process MLS-format emails (pinergy@mlspin.com etc.)
    if (mlsBodies.length > 0) {
      console.log(`\n📄 Processing ${mlsBodies.length} MLS-format email(s)...`);

      for (const mlsEmail of mlsBodies) {
        const status = messageImportStatus.get(mlsEmail.msgId) || { total: 0, imported: 0, failed: 0 };
        messageImportStatus.set(mlsEmail.msgId, status);

        // Split the body on MLS ID markers — one email may contain several listings
        const text = mlsEmail.body;
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

        status.total = chunks.filter(c => /\$[\d,]{4,}|list\s*price/i.test(c)).length;

        for (const chunk of chunks) {
          if (!/\$[\d,]{4,}|list\s*price/i.test(chunk)) continue;

          try {
            const parsed = parseMLS(chunk);
            if (!parsed.listPrice) {
              console.log(`   ⏭️  ${parsed.address || 'Unknown'} — no price`);
              status.failed++;
              continue;
            }

            // Dedupe by MLS ID
            if (parsed.mlsId) {
              const existing = await prisma.property.findFirst({ where: { mlsId: parsed.mlsId } });
              if (existing) {
                console.log(`   ⏭️  ${parsed.address || existing.address} — already in portfolio (MLS #${parsed.mlsId})`);
                status.imported++; // count as success for trash logic
                skippedCount++;
                continue;
              }
            }

            process.stdout.write(`   ${(parsed.address || 'Unknown').substring(0, 45).padEnd(45)} `);

            // Rent research via Claude
            const rentData = await researchRent(parsed);
            const rent = Number.isFinite(rentData.rent) && rentData.rent > 0 ? rentData.rent : 0;

            // Run analysis
            const analysisResult = analyze(parsed, rent, parsed.listPrice);

            // Save full Property + analysis + rent research
            const saved = await prisma.property.create({
              include: { analysis: true, rentResearch: true },
              data: {
                mlsId: parsed.mlsId || null,
                address: parsed.address || 'Unknown',
                city: parsed.city || null,
                state: parsed.state,
                zip: parsed.zip || null,
                type: parsed.type,
                complex: parsed.complex || null,
                bedrooms: parsed.bedrooms,
                bathrooms: parsed.bathrooms,
                sqft: parsed.sqft,
                yearBuilt: parsed.yearBuilt || null,
                listPrice: parsed.listPrice,
                hoaFee: parsed.hoaFee,
                hoaIncludes: parsed.hoaIncludes || null,
                taxAnnual: parsed.taxAnnual,
                taxYear: parsed.taxYear,
                assessed: parsed.assessed || null,
                parking: parsed.parking,
                dom: parsed.dom,
                rawMls: chunk.substring(0, 50000),
                adjPrice: parsed.listPrice,
                adjRent: rent,
                rentResearch: {
                  create: {
                    rent,
                    low: Number.isFinite(rentData.low) ? rentData.low : 0,
                    high: Number.isFinite(rentData.high) ? rentData.high : 0,
                    confidence: rentData.confidence || 'Low',
                    methodology: rentData.methodology || null,
                    comps: {
                      create: (rentData.comps || []).map(c => ({
                        address: String(c.address || 'Unknown'),
                        rent: Number.isFinite(c.rent) ? c.rent : 0,
                        note: c.note ? String(c.note) : null,
                      })),
                    },
                  },
                },
                analysis: {
                  create: {
                    priceUsed: parsed.listPrice,
                    rentUsed: rent,
                    totalExpMo: analysisResult.totalExpMo,
                    netMo: analysisResult.netMo,
                    capRate: analysisResult.capRate,
                    expRatio: analysisResult.expRatio,
                    grm: analysisResult.grm,
                    breakMo: analysisResult.breakMo,
                    rating: analysisResult.rating,
                    expenses: {
                      create: analysisResult.expenses.map((e, i) => ({
                        name: e.name,
                        monthly: e.monthly,
                        note: e.note,
                        sortOrder: i,
                      })),
                    },
                    observations: {
                      create: analysisResult.observations.map(o => ({
                        color: o.color,
                        icon: o.icon,
                        text: o.text,
                      })),
                    },
                  },
                },
              },
            });
            console.log(`✅ rent $${rent.toLocaleString()} · ${(saved as any).analysis?.rating || ''} · ${(saved as any).analysis?.capRate?.toFixed?.(1) || '?'}% cap`);
            importedCount++;
            status.imported++;
          } catch (e: any) {
            const msg = e?.message || String(e);
            console.log(`❌ ${msg.substring(0, 80)}`);
            importErrors.push(`MLS chunk: ${msg}`);
            status.failed++;
          }

          // Pacing
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping DB import (--skip-db). Listings saved to JSON only.');
  }

  // Trash emails whose listings were all successfully handled
  if (!noTrash && !skipDb) {
    console.log('\n🗑  Trashing processed emails...');
    for (const [msgId, status] of messageImportStatus.entries()) {
      if (status.total === 0) continue; // no listings in this email
      if (status.failed === 0 && status.imported === status.total) {
        try {
          await gmailTrashMessage(accessToken, msgId);
          console.log(`   ✓ Trashed message ${msgId}`);
        } catch (e: any) {
          console.log(`   ⚠️  Could not trash ${msgId}: ${e.message}`);
        }
      } else {
        console.log(`   ⏭️  Keeping ${msgId} (${status.imported}/${status.total} imported, ${status.failed} failed)`);
      }
    }
  } else if (noTrash) {
    console.log('\n📬 --no-trash: leaving emails in inbox.');
  }

  console.log(`\n✅ Done!`);
  console.log(`   Imported: ${importedCount}`);
  console.log(`   Skipped (duplicates): ${skippedCount}`);
  if (importErrors.length > 0) {
    console.log(`   Errors: ${importErrors.length}`);
    for (const err of importErrors.slice(0, 10)) {
      console.log(`     ⚠️  ${err.substring(0, 140)}`);
    }
    if (importErrors.length > 10) {
      console.log(`     ... and ${importErrors.length - 10} more`);
    }
  }

  void mlsBodies;
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
