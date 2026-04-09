/**
 * Parses property listings from common real estate alert emails
 * (Zillow, Redfin, Realtor.com, MLS alerts, agent emails).
 */

export interface EmailListing {
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  type: string;
  listingUrl: string;
  source: string;
  highlight?: string;
}

function num(s: string | undefined | null): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,%\s,]/g, '')) || 0;
}

/**
 * Extract all listing URLs from an email body (any source).
 * Returns unique URLs pointing to listing detail pages.
 */
export function extractListingUrls(emailBody: string): string[] {
  const patterns = [
    // Zillow tracking links + direct homedetails links
    /https?:\/\/\S*?(?:click\.mail\.)?zillow\.com\/\S+/gi,
    // Redfin
    /https?:\/\/\S*?redfin\.com\/\S+/gi,
    // Realtor.com
    /https?:\/\/\S*?realtor\.com\/\S+/gi,
    // Trulia
    /https?:\/\/\S*?trulia\.com\/\S+/gi,
    // Compass
    /https?:\/\/\S*?compass\.com\/\S+/gi,
    // Homes.com
    /https?:\/\/\S*?homes\.com\/\S+/gi,
  ];

  const urls = new Set<string>();

  for (const pattern of patterns) {
    const matches = emailBody.matchAll(pattern);
    for (const m of matches) {
      // Clean trailing punctuation/whitespace/brackets
      const url = m[0].replace(/[>\s)"'.,;]+$/, '');

      // Filter out unsubscribe/settings/footer links
      if (/unsubscribe|preferences|settings|account|profile|help|support|privacy|terms|tos|about|contact|careers|agent-finder|mortgage/i.test(url)) continue;

      urls.add(url);
    }
  }

  return Array.from(urls);
}

function parseZillowEmail(_text: string): EmailListing[] {
  // Email-body parsing disabled — we now fetch each listing URL and use the
  // full page content for analysis. See extractListingUrls + scripts/email-sync.ts.
  return [];
}

/**
 * Extract listings from Redfin alert email body.
 */
function parseRedfinEmail_unused(text: string): EmailListing[] {
  const listings: EmailListing[] = [];

  // Redfin emails: "$349,000 2 Bed 1 Bath 850 Sq. Ft."
  // followed by address and redfin.com link
  const blocks = text.split(/(?=\$[\d,]+\s)/);

  for (const block of blocks) {
    const priceMatch = block.match(/\$([\d,]+)/);
    if (!priceMatch) continue;
    const price = num(priceMatch[1]);
    if (price < 10000) continue;

    const beds = num(block.match(/(\d+)\s*(?:Bed|bd|br)/i)?.[1]);
    const baths = num(block.match(/([\d.]+)\s*(?:Bath|ba)/i)?.[1]);
    const sqft = num(block.match(/([\d,]+)\s*(?:Sq\.?\s*Ft|sqft)/i)?.[1]);

    const addrMatch = block.match(/(\d+\s+[\w\s]+?(?:St|Ave|Rd|Dr|Ln|Blvd|Way|Ct|Pl|Cir|Ter)[\w.]*)\s*(?:#\s*\w+|,\s*(?:Unit|Apt|#)\s*\w+)?\s*,\s*([A-Za-z\s]+)\s*,\s*([A-Z]{2})\s*(\d{5})?/i);
    if (!addrMatch) continue;

    const urlMatch = block.match(/https?:\/\/(?:www\.)?redfin\.com\/\S+/i);

    listings.push({
      address: addrMatch[1].trim(),
      city: addrMatch[2].trim(),
      state: addrMatch[3].toUpperCase(),
      zip: addrMatch[4] || '',
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      type: 'Condo',
      listingUrl: urlMatch?.[0]?.replace(/[>\s)]+$/, '') || '',
      source: 'Redfin',
    });
  }

  return listings;
}

/**
 * Extract listings from Realtor.com alert email body.
 */
function parseRealtorEmail_unused(text: string): EmailListing[] {
  const listings: EmailListing[] = [];

  const blocks = text.split(/(?=\$[\d,]+)/);

  for (const block of blocks) {
    const priceMatch = block.match(/\$([\d,]+)/);
    if (!priceMatch) continue;
    const price = num(priceMatch[1]);
    if (price < 10000) continue;

    const beds = num(block.match(/(\d+)\s*(?:bed|bd|br)/i)?.[1]);
    const baths = num(block.match(/([\d.]+)\s*(?:bath|ba)/i)?.[1]);
    const sqft = num(block.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i)?.[1]);

    const addrMatch = block.match(/(\d+\s+[\w\s]+?(?:St|Ave|Rd|Dr|Ln|Blvd|Way|Ct|Pl|Cir|Ter)[\w.]*)\s*(?:#\s*\w+|,\s*(?:Unit|Apt|#)\s*\w+)?\s*,\s*([A-Za-z\s]+)\s*,\s*([A-Z]{2})\s*(\d{5})?/i);
    if (!addrMatch) continue;

    const urlMatch = block.match(/https?:\/\/(?:www\.)?realtor\.com\/\S+/i);

    listings.push({
      address: addrMatch[1].trim(),
      city: addrMatch[2].trim(),
      state: addrMatch[3].toUpperCase(),
      zip: addrMatch[4] || '',
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      type: 'Condo',
      listingUrl: urlMatch?.[0]?.replace(/[>\s)]+$/, '') || '',
      source: 'Realtor.com',
    });
  }

  return listings;
}

/**
 * Generic fallback parser for any listing email.
 * Looks for price + address + URL patterns.
 */
function parseGenericListingEmail_unused(text: string): EmailListing[] {
  const listings: EmailListing[] = [];

  // Find all listing URLs
  const urlPatterns = [
    /https?:\/\/(?:www\.)?(?:zillow|redfin|realtor|trulia|homes|movoto|compass)\.com\/\S+/gi,
    /https?:\/\/\S*(?:listing|property|home|detail)\S*/gi,
  ];

  const urls: string[] = [];
  for (const pattern of urlPatterns) {
    const matches = text.match(pattern) || [];
    urls.push(...matches.map(u => u.replace(/[>\s)]+$/, '')));
  }

  // Try to find price + address combos near each URL
  for (const url of urls) {
    const urlIdx = text.indexOf(url);
    // Look at text surrounding the URL (500 chars before and after)
    const context = text.substring(Math.max(0, urlIdx - 500), urlIdx + url.length + 200);

    const priceMatch = context.match(/\$([\d,]+)/);
    if (!priceMatch) continue;
    const price = num(priceMatch[1]);
    if (price < 10000) continue;

    const beds = num(context.match(/(\d+)\s*(?:bd|bed|br|bedroom)/i)?.[1]);
    const baths = num(context.match(/([\d.]+)\s*(?:ba|bath|bathroom)/i)?.[1]);
    const sqft = num(context.match(/([\d,]+)\s*(?:sqft|sq\.?\s*ft)/i)?.[1]);

    const addrMatch = context.match(/(\d+\s+[\w\s]+?(?:St|Ave|Rd|Dr|Ln|Blvd|Way|Ct|Pl|Cir|Ter)[\w.]*)\s*(?:#\s*\w+|,\s*(?:Unit|Apt|#)\s*\w+)?\s*,\s*([A-Za-z\s]+)\s*,\s*([A-Z]{2})\s*(\d{5})?/i);

    listings.push({
      address: addrMatch?.[1]?.trim() || 'Unknown',
      city: addrMatch?.[2]?.trim() || '',
      state: addrMatch?.[3]?.toUpperCase() || 'MA',
      zip: addrMatch?.[4] || '',
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      type: 'Condo',
      listingUrl: url,
      source: 'Email',
    });
  }

  return listings;
}

/**
 * Detect the email source and parse accordingly.
 */
export function detectSource(text: string): string {
  if (/zillow/i.test(text)) return 'zillow';
  if (/redfin/i.test(text)) return 'redfin';
  if (/realtor\.com/i.test(text)) return 'realtor';
  return 'generic';
}

/**
 * Parse listings from an email body. Tries source-specific parsers first,
 * then falls back to generic extraction.
 */
export function parseListingEmail(emailBody: string): EmailListing[] {
  const source = detectSource(emailBody);

  // Email-body parsing is disabled — use extractListingUrls + fetch pipeline
  // instead. This remains as a no-op stub for API compatibility.
  void source;
  void parseZillowEmail;
  void parseRedfinEmail_unused;
  void parseRealtorEmail_unused;
  void parseGenericListingEmail_unused;
  const listings: EmailListing[] = [];

  // Deduplicate by address
  const seen = new Set<string>();
  return listings.filter(l => {
    const key = l.address.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
