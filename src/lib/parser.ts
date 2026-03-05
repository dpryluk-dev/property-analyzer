export interface ParsedProperty {
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  mlsId: string;
  complex: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;
  listPrice: number;
  hoaFee: number;
  hoaIncludes: string;
  taxAnnual: number;
  taxYear: number;
  assessed: number;
  parking: number;
  dom: number;
}

function num(s: string | undefined | null): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,%\s,]/g, '')) || 0;
}

function find(text: string, pats: RegExp[], isNum: true): number;
function find(text: string, pats: RegExp[], isNum: false): string;
function find(text: string, pats: RegExp[], isNum: boolean = true): number | string {
  for (const p of pats) {
    const m = text.match(p);
    if (m) {
      const v = m[1] || m[2] || m[3] || '';
      return isNum ? num(v) : v.trim();
    }
  }
  return isNum ? 0 : '';
}

export function parseMLS(raw: string): ParsedProperty {
  const flat = raw.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');

  const price = find(flat, [/list\s*price\s*[:=]?\s*\$?([\d,]+)/i, /price\s*[:=]?\s*\$?([\d,]+)/i, /\$\s*([\d,]{5,})/], true);

  const bedsMLS = find(flat, [/\d+\s*rm\s*\/\s*(\d+)\s*bdr/i], true);
  const beds = bedsMLS || find(flat, [/(\d+)\s*(?:bdr|bed(?:room)?s?|br|bd)/i, /bed(?:room)?s?\s*[:=]?\s*(\d+)/i], true);

  const fullB = find(flat, [/(\d+)\s*f(?:ull)?[\s,]*\d*\s*h/i, /(\d+)\s*full/i], true);
  const halfB = find(flat, [/\d+\s*f(?:ull)?[\s,]*(\d+)\s*h(?:alf)?/i, /(\d+)\s*half/i], true);
  const baths = (fullB + halfB * 0.5) || find(flat, [/([\d.]+)\s*(?:bath(?:room)?s?|ba)/i], true);

  const sqft = find(flat, [/(?:living\s*area|area)\s*[:=]?\s*([\d,]+)\s*sq/i, /([\d,]+)\s*sq\.?\s*f/i, /([\d,]+)\s*sqft/i], true);
  const year = find(flat, [/year\s*built(?:\/\w+)?\s*[:=]?\s*(\d{4})/i], true);
  const hoa = find(flat, [/fee\s*[:=]?\s*\$?([\d,]+)\s*monthly/i, /\$?([\d,]+)\s*monthly/i, /(?:hoa|condo\s*fee|assoc\w*\s*fee)\s*[:=]?\s*\$?([\d,]+)/i], true);
  const hoaInc = find(flat, [/fee\s*incl\w*\s*[:=]?\s*([^\.]{10,200})/i], false);
  const tax = find(flat, [/tax\s*[:=]?\s*\$?([\d,]+)/i], true);
  const taxYr = find(flat, [/tax\s*year\s*[:=]?\s*(\d{4})/i], true);
  const dom = find(flat, [/(\d+)\s*dom\b/i, /days\s*on\s*market\s*[:=]?\s*(\d+)/i], true);
  const assessed = find(flat, [/assessed\s*[:=]?\s*\$?([\d,]+)/i], true);
  const complex = find(flat, [/complex\s*name\s*[:=]?\s*([^\n,]{3,50})/i], false);
  const parking = find(flat, [/total\s*parking\s*[:=]?\s*(\d+)/i, /parking\s*spaces?\s*[:=]?\s*(\d+)/i], true);
  const mlsId = find(flat, [/mls\s*#?\s*[:=]?\s*(\d+)/i], false);

  let type = 'Condo';
  if (/single[\s-]*family|sfr|detached/i.test(flat)) type = 'Single Family';
  else if (/multi[\s-]*family|duplex/i.test(flat)) type = 'Multi-Family';
  else if (/townho/i.test(flat)) type = 'Townhouse';

  const style = find(flat, [/style\s*[:=]?\s*(\w[\w\s]{2,15}?)(?:\s*,|\s*$)/im], false);
  if (style && style.length < 16) type += ` - ${style}`;

  const address = find(flat, [
    /located\s*at\s*[:=]?\s*([\d]+\s+[\w\s]+?(?:st|ave|rd|dr|ln|blvd|way|ct|pl|cir|ter)[\w.]*(?:\s*,?\s*(?:u(?:nit)?|#)\s*[:=]?\s*\w+)?)/i,
    /(\d+\s+\w[\w\s]*?(?:st(?:reet)?|ave|rd|dr|ln|blvd|way|ct|pl)[\w.]*(?:\s*[#,]?\s*(?:u(?:nit)?)?\s*\w+)?)/i,
  ], false);

  const city = find(flat, [
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*,\s*[A-Z]{2}\s*,?\s*\d{5}/,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*,\s*MA/,
  ], false);

  const state = find(flat, [/,\s*([A-Z]{2})\s*,?\s*\d{5}/], false) || 'MA';
  const zip = find(flat, [/\b(\d{5})\b/], false);

  return {
    address, city, state, zip, type, mlsId, complex,
    bedrooms: beds, bathrooms: baths, sqft,
    yearBuilt: year, listPrice: price,
    hoaFee: hoa, hoaIncludes: hoaInc,
    taxAnnual: tax, taxYear: taxYr || 2025,
    assessed, parking, dom,
  };
}
