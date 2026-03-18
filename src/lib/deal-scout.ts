import Anthropic from '@anthropic-ai/sdk';

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

const client = new Anthropic();

export async function scoutBostonDeals(): Promise<ScoutedDealResult[]> {
  const prompt = `Search for the best real estate investment deals currently listed for sale in the Greater Boston area (Boston, Cambridge, Somerville, Brookline, Quincy, Medford, Malden, Revere, Chelsea, Everett, Waltham, Newton, Watertown, Arlington, Belmont, MA).

Focus on:
- Condos, multi-family, and townhouses priced under $800,000
- Properties with good rental potential (high cap rate for the area)
- New listings or recent price reductions
- Foreclosures, short sales, or motivated seller deals
- Properties in up-and-coming neighborhoods

Search Zillow, Redfin, Realtor.com, and other listing sites for current deals.

For each property found, estimate the monthly rent based on comparable rentals in the area, and calculate an approximate cap rate assuming:
- HOA: $350/mo for condos, $0 for multi-family
- Insurance: $100/mo
- Taxes: use 1.2% of price annually
- Maintenance: 5% of rent
- Vacancy: 5% of rent

Respond ONLY with a JSON array of up to 10 best deals:
[{
  "address": "123 Main St Unit 4",
  "city": "Boston",
  "state": "MA",
  "zip": "02130",
  "price": 425000,
  "bedrooms": 2,
  "bathrooms": 1,
  "sqft": 900,
  "type": "Condo",
  "source": "Zillow",
  "sourceUrl": "https://...",
  "highlight": "Price reduced 10%, near Orange Line, strong rental demand",
  "estimatedRent": 2400,
  "estimatedCap": 4.2
}]

Return ONLY valid JSON array, no other text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: 'You are a real estate deal scout for the Boston MA area. Search for currently listed properties and analyze their investment potential. Respond with ONLY valid JSON, no other text.',
    tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const allText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  if (!allText.trim()) throw new Error('Empty response from deal scout');

  const cleaned = allText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  // Extract JSON array
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '[') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === ']') { depth--; if (depth === 0 && start >= 0) {
      const parsed = JSON.parse(cleaned.substring(start, i + 1));
      return Array.isArray(parsed) ? parsed : [];
    }}
  }

  // Try object fallback (single deal wrapped)
  depth = 0; start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      return [JSON.parse(cleaned.substring(start, i + 1))];
    }}
  }

  throw new Error('Could not parse scouted deals');
}
