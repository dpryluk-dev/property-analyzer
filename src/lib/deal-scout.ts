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
};

function estimateRent(sqft: number, beds: number, city: string): number {
  const cityKey = city.toLowerCase();
  const perSqft = RENT_PER_SQFT[cityKey] || 2.5;

  if (sqft > 0) {
    return Math.round(sqft * perSqft);
  }
  // Fallback by bedrooms
  const baseBeds: Record<number, number> = { 0: 1600, 1: 1900, 2: 2400, 3: 2900, 4: 3400 };
  return baseBeds[Math.min(beds, 4)] || 2400;
}

function estimateCapRate(price: number, rentMo: number, type: string, hoaMo: number): number {
  const hoaActual = hoaMo || (type === 'Condo' ? 350 : 0);
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

  // Check sashes for price drops, hot homes, etc.
  const sashes = home.sashes || [];
  for (const s of sashes) {
    if (s.sashTypeName === 'Price Drop') parts.push('Price reduced');
    if (s.sashTypeName === 'Hot Home') parts.push('Hot home');
    if (s.sashTypeName === 'Open House') parts.push(s.openHouseText || 'Open house');
  }

  // Key facts
  const keyFacts = home.keyFacts || [];
  for (const f of keyFacts) {
    if (f.description) parts.push(f.description);
  }

  // Listing remarks excerpt
  if (parts.length < 2 && home.listingRemarks) {
    const remarks = home.listingRemarks.substring(0, 120);
    parts.push(remarks + '...');
  }

  return parts.slice(0, 3).join(' · ') || 'Investment opportunity in Greater Boston';
}

// Redfin region IDs for Greater Boston areas
const REDFIN_SEARCHES = [
  // Boston metro - region_id 1826 is Boston city
  { regionId: 1826, regionType: 6, name: 'Boston' },
  // We search the whole Boston metro which includes surrounding cities
];

export async function scoutBostonDeals(): Promise<ScoutedDealResult[]> {
  const allDeals: ScoutedDealResult[] = [];

  for (const search of REDFIN_SEARCHES) {
    try {
      // Search for condos, townhouses, and multi-family under $800K, sorted by newest
      const url = `https://www.redfin.com/stingray/api/gis?al=1&market=boston&max_price=800000&num_homes=25&ord=redfin-recommended-asc&page_number=1&region_id=${search.regionId}&region_type=${search.regionType}&uipt=1,2,3,4&sf=1,2,3,5,6,7&status=9&v=8`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Redfin search failed for ${search.name}: ${response.status}`);
        continue;
      }

      const text = await response.text();
      // Redfin prefixes JSON with {}&&
      const jsonText = text.replace(/^{}&&/, '');
      const data = JSON.parse(jsonText);

      const homes = data?.payload?.homes || [];

      for (const home of homes) {
        const price = home.price?.value;
        if (!price || price > 800000 || price < 50000) continue;

        const beds = home.beds || 0;
        const baths = home.baths || 0;
        const sqft = home.sqFt?.value || 0;
        const city = home.city || 'Boston';
        const type = PROPERTY_TYPES[home.propertyType] || 'Other';
        const hoaMo = home.hoa?.value || 0;

        const estRent = estimateRent(sqft, beds, city);
        const estCap = estimateCapRate(price, estRent, type, hoaMo);

        allDeals.push({
          address: home.streetLine?.value || 'Unknown',
          city,
          state: home.state || 'MA',
          zip: home.zip || home.postalCode?.value,
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
      console.error(`Error fetching from Redfin for ${search.name}:`, e);
    }
  }

  // Sort by estimated cap rate descending, return top 10
  allDeals.sort((a, b) => (b.estimatedCap || 0) - (a.estimatedCap || 0));
  return allDeals.slice(0, 10);
}
