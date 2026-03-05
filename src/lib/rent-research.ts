import Anthropic from '@anthropic-ai/sdk';
import type { ParsedProperty } from './parser';

export interface RentCompItem {
  address: string;
  rent: number;
  note: string;
}

export interface RentResearchResult {
  rent: number;
  low: number;
  high: number;
  confidence: string;
  methodology: string;
  comps: RentCompItem[];
}

const client = new Anthropic();

export async function researchRent(p: ParsedProperty): Promise<RentResearchResult> {
  const loc = [p.city, p.state, p.zip].filter(Boolean).join(' ') || 'Massachusetts';
  const bedStr = p.bedrooms > 0 ? `${p.bedrooms} bedroom` : '';
  const typeStr = /condo/i.test(p.type) ? 'condo' : /town/i.test(p.type) ? 'townhouse' : 'apartment';
  const street = (p.address || '').replace(/[,#]?\s*(u(nit)?|apt|#)\s*\w+$/i, '').trim();
  const complexName = p.complex || '';

  const prompt = `Search for rental listings at the SAME ADDRESS/BUILDING first: "${street}"${complexName ? ` (complex: "${complexName}")` : ''} in ${loc}.

PRIORITY: Find units for rent at this exact street address or complex. These are the most accurate comps.
If no same-building results, then search for ${bedStr} ${typeStr} rentals nearby in ${loc}.

Property details: ${bedStr}, ${p.sqft || '?'} sqft, listed $${(p.listPrice || 0).toLocaleString()}.

Respond ONLY with JSON: {"rent":number,"low":number,"high":number,"confidence":"High|Medium|Low","comps":[{"address":"...","rent":number,"note":"..."}],"methodology":"..."}

Set confidence to "High" if you found same-building comps, "Medium" for same-neighborhood, "Low" for broader area estimates.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You research rental prices. ALWAYS search for the specific address/building first. Respond with ONLY valid JSON, no other text.',
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    const allText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (!allText.trim()) throw new Error('Empty response');

    const cleaned = allText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

    // Extract JSON with brace depth counting
    let depth = 0, start = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) return JSON.parse(cleaned.substring(start, i + 1)); }
    }

    // Fallback: extract a number
    const nm = allText.match(/\$?([\d,]+)/);
    if (nm) {
      const r = parseFloat(nm[1].replace(/,/g, ''));
      if (r > 500 && r < 10000) {
        return { rent: r, low: Math.round(r * 0.85), high: Math.round(r * 1.15), confidence: 'Medium', comps: [], methodology: 'Web search estimate' };
      }
    }

    throw new Error('Could not parse rent data');
  } catch (err) {
    // Formula fallback
    const est = Math.max(
      Math.round((p.listPrice || 200000) / 19 / 12 / 50) * 50,
      (p.bedrooms || 1) * 800
    );
    return {
      rent: est,
      low: Math.round(est * 0.85),
      high: Math.round(est * 1.15),
      confidence: 'Low',
      comps: [],
      methodology: `Formula estimate (API error: ${err instanceof Error ? err.message : 'unknown'}). Verify on Zillow/Apartments.com.`,
    };
  }
}
