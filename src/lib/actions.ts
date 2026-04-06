'use server';

import prisma from '@/lib/db';
import { parseMLS } from '@/lib/parser';
import { analyze } from '@/lib/analysis';
import { researchRent } from '@/lib/rent-research';
import { scoutBostonDeals } from '@/lib/deal-scout';
import { parseListingEmail, type EmailListing } from '@/lib/email-listing-parser';

export async function analyzeProperty(rawMls: string) {
  const parsed = parseMLS(rawMls);

  if (!parsed.listPrice) {
    throw new Error('Could not find a price in the listing. Check the MLS text.');
  }

  // Research rent
  const rentData = await researchRent(parsed);

  // Run analysis
  const result = analyze(parsed, rentData.rent, parsed.listPrice);

  // Save to DB
  // Ensure rent values are valid numbers
  const safeRent = typeof rentData.rent === 'number' && isFinite(rentData.rent) ? rentData.rent : 0;
  const safeLow = typeof rentData.low === 'number' && isFinite(rentData.low) ? rentData.low : 0;
  const safeHigh = typeof rentData.high === 'number' && isFinite(rentData.high) ? rentData.high : 0;

  const property = await prisma.property.create({
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
      rawMls: rawMls.substring(0, 50000), // cap storage
      adjPrice: parsed.listPrice,
      adjRent: safeRent,

      rentResearch: {
        create: {
          rent: safeRent,
          low: safeLow,
          high: safeHigh,
          confidence: rentData.confidence || 'Low',
          methodology: rentData.methodology || null,
          comps: {
            create: (Array.isArray(rentData.comps) ? rentData.comps : []).map(c => ({
              address: String(c.address || 'Unknown'),
              rent: typeof c.rent === 'number' && isFinite(c.rent) ? c.rent : 0,
              note: c.note ? String(c.note) : null,
            })),
          },
        },
      },

      analysis: {
        create: {
          priceUsed: parsed.listPrice,
          rentUsed: safeRent,
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
    include: {
      rentResearch: { include: { comps: true } },
      analysis: { include: { expenses: { orderBy: { sortOrder: 'asc' } }, observations: true } },
    },
  });

  // Serialize to plain JSON to avoid Date/Prisma serialization issues with server actions
  return JSON.parse(JSON.stringify(property));
}

export async function getPortfolio() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rentResearch: { include: { comps: true } },
      analysis: { include: { expenses: { orderBy: { sortOrder: 'asc' } }, observations: true } },
      dealNotes: { orderBy: { createdAt: 'desc' } },
    },
  });

  // Attach listing URLs from scouted deals that were promoted
  const propertyIds = properties.map(p => p.id);
  const scoutedDeals = await prisma.scoutedDeal.findMany({
    where: { promotedId: { in: propertyIds } },
    select: { promotedId: true, sourceUrl: true },
  });
  const urlMap = new Map(scoutedDeals.map(sd => [sd.promotedId, sd.sourceUrl]));

  const result = properties.map(p => {
    const { rawMls, ...rest } = p; // exclude rawMls — not needed on client, reduces payload
    return {
      ...rest,
      listingUrl: p.listingUrl || urlMap.get(p.id) || null,
    };
  });

  // Serialize to plain JSON to avoid Date/Prisma serialization issues with server actions
  return JSON.parse(JSON.stringify(result));
}

export async function deleteProperty(id: string) {
  await prisma.property.delete({ where: { id } });
}

export async function renameProperty(id: string, name: string) {
  'use server';
  await prisma.property.update({ where: { id }, data: { address: name.trim() } });
  return getPortfolio();
}

export async function updateAdjustments(id: string, adjPrice: number, adjRent: number) {
  // Fetch property to recompute analysis
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw new Error('Property not found');

  const parsed = {
    ...property,
    hoaIncludes: property.hoaIncludes || '',
    yearBuilt: property.yearBuilt || 0,
    assessed: property.assessed || 0,
  };

  const result = analyze(parsed as any, adjRent, adjPrice);

  // Update property adjustments
  await prisma.property.update({
    where: { id },
    data: { adjPrice, adjRent },
  });

  // Delete old analysis and create new one
  await prisma.analysis.deleteMany({ where: { propertyId: id } });

  await prisma.analysis.create({
    data: {
      propertyId: id,
      priceUsed: adjPrice,
      rentUsed: adjRent,
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
  });

  return getPortfolio();
}

export async function updateDealStage(propertyId: string, stage: string) {
  await prisma.property.update({
    where: { id: propertyId },
    data: { dealStage: stage },
  });
  return getPortfolio();
}

export async function addDealNote(propertyId: string, text: string, stage: string, milestone: boolean = false) {
  await prisma.dealNote.create({
    data: { propertyId, text, stage, milestone },
  });
  return getPortfolio();
}

export async function updatePurchaseInfo(propertyId: string, purchasePrice: number, closedDate: string | null) {
  await prisma.property.update({
    where: { id: propertyId },
    data: {
      purchasePrice,
      closedDate: closedDate ? new Date(closedDate) : null,
    },
  });
  return getPortfolio();
}

// --- Scouted Deals ---

export async function runDealScout(): Promise<{ success: boolean; error?: string }> {
  let deals;
  try {
    deals = await scoutBostonDeals();
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('credit') || msg.includes('balance') || msg.includes('billing')) {
      return { success: false, error: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com to use the Deal Scout.' };
    }
    return { success: false, error: `Deal scout failed: ${msg}` };
  }

  try {
    for (const d of deals) {
      // Skip duplicates — check ALL deals (including dismissed/promoted)
      const existing = await prisma.scoutedDeal.findFirst({
        where: { address: d.address },
      });
      if (existing) continue;

      await prisma.scoutedDeal.create({
        data: {
          address: d.address || 'Unknown',
          city: d.city || 'Boston',
          state: d.state || 'MA',
          zip: d.zip || null,
          price: d.price || 0,
          bedrooms: d.bedrooms || 0,
          bathrooms: d.bathrooms || 0,
          sqft: d.sqft || 0,
          type: d.type || 'Condo',
          source: d.source || null,
          sourceUrl: d.sourceUrl || null,
          highlight: d.highlight || null,
          estimatedRent: d.estimatedRent || null,
          estimatedCap: d.estimatedCap || null,
        },
      });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Failed to save deals: ${e?.message || String(e)}` };
  }
}

export async function getScoutedDeals() {
  try {
    const deals = await prisma.scoutedDeal.findMany({
      where: { dismissed: false, promotedId: null },
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(deals));
  } catch {
    return [];
  }
}

export async function dismissScoutedDeal(id: string) {
  await prisma.scoutedDeal.update({
    where: { id },
    data: { dismissed: true },
  });
  return getScoutedDeals();
}

// --- Listing Page Fetch & Import ---

import Anthropic from '@anthropic-ai/sdk';

/**
 * Use the Anthropic web_search tool to fetch a listing URL and extract
 * structured listing data. This bypasses Zillow/Redfin bot blocking by
 * routing the fetch through Anthropic's infrastructure.
 */
export async function fetchListingViaClaude(url: string): Promise<{
  finalUrl: string;
  mlsText: string;
  error?: string;
}> {
  try {
    const client = new Anthropic();

    // Extract zpid or id from URL for the search query
    const zpid = url.match(/(\d+)_zpid/)?.[1];
    const searchQuery = zpid
      ? `Zillow homedetails ${zpid}`
      : url;

    const prompt = `Fetch this real estate listing URL and extract the listing details: ${url}

${zpid ? `Search query hint: "${searchQuery}"` : ''}

Extract the following fields and respond with ONLY a JSON object (no other text):
{
  "address": "street address",
  "city": "city",
  "state": "2-letter state code",
  "zip": "zip code",
  "price": number (list price in dollars),
  "bedrooms": number,
  "bathrooms": number,
  "sqft": number (living area),
  "yearBuilt": number,
  "type": "Condo|Single Family|Multi-Family|Townhouse",
  "hoaFee": number (monthly HOA, 0 if none),
  "taxAnnual": number (annual property tax, 0 if unknown),
  "description": "brief description including HOA inclusions, parking, etc."
}

If you cannot fetch the page, use null for unknown fields but always include a numeric price.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You extract structured real estate listing data. Respond with ONLY valid JSON, no other text.',
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    const allText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (!allText.trim()) {
      return { finalUrl: url, mlsText: '', error: 'Empty response from Claude' };
    }

    const cleaned = allText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

    // Extract JSON using brace depth counting
    let depth = 0, start = -1;
    let extracted: any = null;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          try { extracted = JSON.parse(cleaned.substring(start, i + 1)); } catch {}
          break;
        }
      }
    }

    if (!extracted || !extracted.price) {
      return { finalUrl: url, mlsText: '', error: 'Could not extract listing data' };
    }

    // Convert structured data to synthetic MLS text for the existing parser
    const mlsText = [
      `List Price: $${Number(extracted.price).toLocaleString()}`,
      extracted.address ? `Address: ${extracted.address}` : '',
      extracted.city ? `City: ${extracted.city}` : '',
      extracted.state ? `State: ${extracted.state}` : '',
      extracted.zip ? `Zip: ${extracted.zip}` : '',
      `Type: ${extracted.type || 'Condo'}`,
      extracted.bedrooms ? `Bedrooms: ${extracted.bedrooms}` : '',
      extracted.bathrooms ? `Bathrooms: ${extracted.bathrooms}` : '',
      extracted.sqft ? `Living Area: ${extracted.sqft} sqft` : '',
      extracted.yearBuilt ? `Year Built: ${extracted.yearBuilt}` : '',
      extracted.hoaFee ? `HOA Fee: $${extracted.hoaFee} monthly` : '',
      extracted.taxAnnual ? `Tax: $${extracted.taxAnnual}` : '',
      extracted.description || '',
    ].filter(Boolean).join('\n');

    return { finalUrl: url, mlsText };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('credit') || msg.includes('balance') || msg.includes('billing')) {
      return { finalUrl: url, mlsText: '', error: 'Anthropic API credits exhausted' };
    }
    return { finalUrl: url, mlsText: '', error: msg };
  }
}

/**
 * Fetch a listing URL via Claude web_search, run ROI analysis, and save.
 */
export async function importListingFromUrl(url: string): Promise<{
  success: boolean;
  error?: string;
  property?: any;
}> {
  const fetched = await fetchListingViaClaude(url);

  if (fetched.error || !fetched.mlsText) {
    return { success: false, error: fetched.error || 'Empty listing data' };
  }

  try {
    const property = await analyzeProperty(fetched.mlsText);

    await prisma.property.update({
      where: { id: property.id },
      data: { listingUrl: fetched.finalUrl },
    });
    property.listingUrl = fetched.finalUrl;

    return { success: true, property };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

// --- Email Listing Import ---

export async function importListingsFromEmail(emailBody: string): Promise<{
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  properties: any[];
}> {
  const listings = parseListingEmail(emailBody);
  const results: any[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const listing of listings) {
    // Skip if we already have this address
    const existing = await prisma.property.findFirst({
      where: { address: listing.address },
    });
    if (existing) {
      // If existing property doesn't have a listingUrl, update it
      if (!existing.listingUrl && listing.listingUrl) {
        await prisma.property.update({
          where: { id: existing.id },
          data: { listingUrl: listing.listingUrl },
        });
      }
      skipped++;
      continue;
    }

    // Build synthetic MLS text for the analyzer
    const syntheticMls = [
      `List Price: $${listing.price.toLocaleString()}`,
      `Address: ${listing.address}`,
      listing.city ? `City: ${listing.city}` : '',
      listing.state ? `State: ${listing.state}` : '',
      listing.zip ? `Zip: ${listing.zip}` : '',
      `Type: ${listing.type}`,
      listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : '',
      listing.bathrooms ? `Bathrooms: ${listing.bathrooms}` : '',
      listing.sqft ? `Sqft: ${listing.sqft}` : '',
    ].filter(Boolean).join('\n');

    try {
      const property = await analyzeProperty(syntheticMls);

      // Attach listing URL
      if (listing.listingUrl) {
        await prisma.property.update({
          where: { id: property.id },
          data: { listingUrl: listing.listingUrl },
        });
        property.listingUrl = listing.listingUrl;
      }

      results.push(property);
    } catch (e: any) {
      errors.push(`${listing.address}: ${e?.message || String(e)}`);
    }
  }

  return {
    success: errors.length === 0,
    imported: results.length,
    skipped,
    errors,
    properties: results,
  };
}

export async function importSingleListing(listing: {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  type?: string;
  listingUrl?: string;
  source?: string;
}): Promise<{ success: boolean; error?: string; property?: any }> {
  // Check for duplicates
  const existing = await prisma.property.findFirst({
    where: { address: listing.address },
  });
  if (existing) {
    if (!existing.listingUrl && listing.listingUrl) {
      await prisma.property.update({
        where: { id: existing.id },
        data: { listingUrl: listing.listingUrl },
      });
    }
    return { success: true, error: 'Property already exists', property: existing };
  }

  const syntheticMls = [
    `List Price: $${listing.price.toLocaleString()}`,
    `Address: ${listing.address}`,
    listing.city ? `City: ${listing.city}` : '',
    listing.state ? `State: ${listing.state}` : '',
    listing.zip ? `Zip: ${listing.zip}` : '',
    `Type: ${listing.type || 'Condo'}`,
    listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : '',
    listing.bathrooms ? `Bathrooms: ${listing.bathrooms}` : '',
    listing.sqft ? `Sqft: ${listing.sqft}` : '',
  ].filter(Boolean).join('\n');

  try {
    const property = await analyzeProperty(syntheticMls);

    if (listing.listingUrl) {
      await prisma.property.update({
        where: { id: property.id },
        data: { listingUrl: listing.listingUrl },
      });
      property.listingUrl = listing.listingUrl;
    }

    return { success: true, property };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function promoteScoutedDeal(id: string): Promise<{ success: boolean; error?: string; property?: any; scoutedDeals?: any[] }> {
  const deal = await prisma.scoutedDeal.findUnique({ where: { id } });
  if (!deal) return { success: false, error: 'Scouted deal not found' };

  // Build a synthetic MLS-like text so the analyzer can process it
  const syntheticMls = [
    `List Price: $${deal.price.toLocaleString()}`,
    `Address: ${deal.address}`,
    deal.city ? `City: ${deal.city}` : '',
    deal.state ? `State: ${deal.state}` : '',
    deal.zip ? `Zip: ${deal.zip}` : '',
    `Type: ${deal.type}`,
    deal.bedrooms ? `Bedrooms: ${deal.bedrooms}` : '',
    deal.bathrooms ? `Bathrooms: ${deal.bathrooms}` : '',
    deal.sqft ? `Sqft: ${deal.sqft}` : '',
  ].filter(Boolean).join('\n');

  let result;
  try {
    result = await analyzeProperty(syntheticMls);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('credit') || msg.includes('balance') || msg.includes('billing')) {
      return { success: false, error: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' };
    }
    return { success: false, error: `Analysis failed: ${msg}` };
  }

  // Mark scouted deal as promoted
  await prisma.scoutedDeal.update({
    where: { id },
    data: { promotedId: result.id },
  });

  return { success: true, property: result, scoutedDeals: await getScoutedDeals() };
}
