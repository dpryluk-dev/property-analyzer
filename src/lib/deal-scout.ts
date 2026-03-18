export interface ScoutedDealResult {
  address: string;
  city: string;
  state: string;
  zip?: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  type: string;
  source: string;
  sourceUrl?: string;
  highlight: string;
  estimatedRent?: number;
  estimatedCap?: number;
}

// Property type mapping from Redfin codes
const PROPERTY_TYPES: Record<number, string> = {
  1: 'House',
  2: 'Condo',
  3: 'Condo',
  4: 'Multi-Family',
  5: 'Land',
  6: 'Other',
};

// Rent estimate per sqft by area (conservative Boston-area estimates)
const RENT_PER_SQFT: Record<string, number> = {
  'boston': 3.5,
  'cambridge': 3.8,
  'somerville': 3.2,
  'brookline': 3.4,
  'jamaica plain': 3.0,
  'roslindale': 2.6,
  'dorchester': 2.5,
  'roxbury': 2.4,
  'mattapan': 2.2,
  'hyde park': 2.3,
  'east boston': 2.8,
  'south boston': 3.5,
  'charlestown': 3.4,
  'brighton': 2.8,
  'allston': 2.8,
  'quincy': 2.5,
  'medford': 2.6,
  'malden': 2.4,
  'revere': 2.3,
  'chelsea': 2.3,
  'everett': 2.3,
  'waltham': 2.5,
  'newton': 2.8,
  'watertown': 2.7,
  'arlington': 2.6,
  'belmont': 2.7,
  'lynn': 2.2,
  'brockton': 2.0,
  'worcester': 1.8,
  'lowell': 1.9,
  'lawrence': 1.8,
  'haverhill': 1.9,
  'salem': 2.3,
  'peabody': 2.2,
  'braintree': 2.4,
  'weymouth': 2.3,
  'taunton': 1.8,
  'fall river': 1.5,
  'new bedford': 1.5,
  'fitchburg': 1.6,
  'leominster': 1.7,
  'framingham': 2.3,
  'marlborough': 2.2,
  'randolph': 2.2,
  'stoughton': 2.1,
};

function estimateRent(sqft: number, beds: number, city: string): number {
  const cityKey = city.toLowerCase();
  const perSqft = RENT_PER_SQFT[cityKey] || 2.2;

  if (sqft > 0) {
    return Math.round(sqft * perSqft);
  }
  // Fallback by bedrooms
  const baseBeds: Record<number, number> = { 0: 1400, 1: 1700, 2: 2100, 3: 2500, 4: 3000 };
  return baseBeds[Math.min(beds, 4)] || 2100;
}

function estimateCapRate(price: number, rentMo: number, type: string, hoaMo: number): number {
  const hoaActual = hoaMo || (type === 'Condo' ? 300 : 0);
  const taxMo = Math.round(price * 0.012 / 12);
  const insMo = type === 'Condo' ? 42 : Math.round(price * 0.006 / 12);
  const maintMo = Math.round(rentMo * 0.05);
  const vacMo = Math.round(rentMo * 0.05);

  const totalExpMo = hoaActual + taxMo + insMo + maintMo + vacMo;
  const noiAnnual = (rentMo - totalExpMo) * 12;
  return price > 0 ? (noiAnnual / price) * 100 : 0;
}

function buildHighlight(home: any): string {
  const parts: string[] = [];

  const dom = home.dom?.value;
  if (dom !== undefined && dom <= 3) parts.push('New listing');
  else if (dom !== undefined && dom <= 7) parts.push(`Listed ${dom} days ago`);

  const sashes = home.sashes || [];
  for (const s of sashes) {
    if (s.sashTypeName === 'Price Drop') parts.push('Price reduced');
    if (s.sashTypeName === 'Hot Home') parts.push('Hot home');
    if (s.sashTypeName === 'Open House') parts.push(s.openHouseText || 'Open house');
  }

  const keyFacts = home.keyFacts || [];
  for (const f of keyFacts) {
    if (f.description) parts.push(f.description);
  }

  if (parts.length < 2 && home.listingRemarks) {
    const remarks = home.listingRemarks.substring(0, 120);
    parts.push(remarks + '...');
  }

  return parts.slice(0, 3).join(' · ') || 'Investment opportunity in Greater Boston';
}

const MAX_PRICE = 300000;

// Greater Boston zip codes grouped by area for parallel fetching
// Using zip code searches (region_type=2) which are more reliable than city IDs
const GREATER_BOSTON_ZIPS = [
  // Boston proper
  '02108', '02109', '02110', '02111', '02113', '02114', '02115', '02116',
  '02118', '02119', '02120', '02121', '02122', '02124', '02125', '02126',
  '02127', '02128', '02129', '02130', '02131', '02132', '02134', '02135',
  '02136',
  // Cambridge / Somerville
  '02138', '02139', '02140', '02141', '02142', '02143', '02144', '02145',
  // Quincy / Braintree / Weymouth
  '02169', '02170', '02171', '02184', '02185', '02188', '02189', '02190',
  // Revere / Chelsea / Everett / Malden / Medford
  '02149', '02150', '02151', '02152', '02148', '02155', '02156',
  // Lynn / Salem / Peabody
  '01901', '01902', '01904', '01905', '01906', '01907', '01960', '01970',
  // Brookline / Newton / Watertown / Waltham
  '02446', '02447', '02458', '02459', '02460', '02461', '02462',
  '02472', '02453', '02451', '02452',
  // Brockton / Randolph / Stoughton
  '02301', '02302', '02303', '02368', '02072',
  // Framingham / Marlborough
  '01701', '01702', '01752',
  // Lowell / Lawrence / Haverhill
  '01850', '01851', '01852', '01840', '01841', '01843', '01830', '01831',
  // Worcester
  '01601', '01602', '01603', '01604', '01605', '01606', '01607', '01608',
  // Fall River / New Bedford / Taunton
  '02720', '02721', '02723', '02740', '02744', '02780',
  // Fitchburg / Leominster
  '01420', '01453',
];

async function fetchRedfinZip(zip: string): Promise<ScoutedDealResult[]> {
  const deals: ScoutedDealResult[] = [];
  try {
    const url = `https://www.redfin.com/stingray/api/gis?al=1&market=boston&max_price=${MAX_PRICE}&min_price=50000&num_homes=20&ord=redfin-recommended-asc&page_number=1&postal_code=${zip}&uipt=1,2,3,4&sf=1,2,3,5,6,7&status=9&v=8`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return deals;

    const text = await response.text();
    const jsonText = text.replace(/^{}&&/, '');
    const data = JSON.parse(jsonText);
    const homes = data?.payload?.homes || [];

    for (const home of homes) {
      const price = home.price?.value;
      if (!price || price > MAX_PRICE || price < 50000) continue;

      const beds = home.beds || 0;
      const baths = home.baths || 0;
      const sqft = home.sqFt?.value || 0;
      const city = home.city || 'Unknown';
      const state = home.state || 'MA';
      const type = PROPERTY_TYPES[home.propertyType] || 'Other';
      const hoaMo = home.hoa?.value || 0;

      // Skip land
      if (type === 'Land') continue;

      const estRent = estimateRent(sqft, beds, city);
      const estCap = estimateCapRate(price, estRent, type, hoaMo);

      deals.push({
        address: home.streetLine?.value || 'Unknown',
        city,
        state,
        zip: home.zip || home.postalCode?.value || zip,
        price,
        bedrooms: beds,
        bathrooms: baths,
        sqft,
        type,
        source: 'Redfin',
        sourceUrl: home.url ? `https://www.redfin.com${home.url}` : undefined,
        highlight: buildHighlight(home),
        estimatedRent: estRent,
        estimatedCap: parseFloat(estCap.toFixed(1)),
      });
    }
  } catch (e) {
    // Silently skip failed zip codes
  }
  return deals;
}

export async function scoutBostonDeals(): Promise<ScoutedDealResult[]> {
  // Fetch all zip codes in parallel batches to avoid overwhelming the server
  const BATCH_SIZE = 10;
  const allDeals: ScoutedDealResult[] = [];
  const seenAddresses = new Set<string>();

  for (let i = 0; i < GREATER_BOSTON_ZIPS.length; i += BATCH_SIZE) {
    const batch = GREATER_BOSTON_ZIPS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(zip => fetchRedfinZip(zip)));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const deal of result.value) {
          // Deduplicate by address
          const key = deal.address.toLowerCase().trim();
          if (!seenAddresses.has(key)) {
            seenAddresses.add(key);
            allDeals.push(deal);
          }
        }
      }
    }

    // Small delay between batches to be respectful
    if (i + BATCH_SIZE < GREATER_BOSTON_ZIPS.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Sort by estimated cap rate descending, return top 15
  allDeals.sort((a, b) => (b.estimatedCap || 0) - (a.estimatedCap || 0));
  return allDeals.slice(0, 15);
}
