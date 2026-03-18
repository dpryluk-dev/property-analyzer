'use server';

import prisma from '@/lib/db';
import { parseMLS } from '@/lib/parser';
import { analyze } from '@/lib/analysis';
import { researchRent } from '@/lib/rent-research';
import { scoutBostonDeals } from '@/lib/deal-scout';

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
      adjRent: rentData.rent,

      rentResearch: {
        create: {
          rent: rentData.rent,
          low: rentData.low,
          high: rentData.high,
          confidence: rentData.confidence,
          methodology: rentData.methodology || null,
          comps: {
            create: (rentData.comps || []).map(c => ({
              address: c.address,
              rent: c.rent,
              note: c.note || null,
            })),
          },
        },
      },

      analysis: {
        create: {
          priceUsed: parsed.listPrice,
          rentUsed: rentData.rent,
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

  return property;
}

export async function getPortfolio() {
  return prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rentResearch: { include: { comps: true } },
      analysis: { include: { expenses: { orderBy: { sortOrder: 'asc' } }, observations: true } },
      dealNotes: { orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function deleteProperty(id: string) {
  await prisma.property.delete({ where: { id } });
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

export async function runDealScout() {
  const deals = await scoutBostonDeals();

  const created = [];
  for (const d of deals) {
    // Skip duplicates by address (case-insensitive)
    const existing = await prisma.scoutedDeal.findFirst({
      where: {
        address: { equals: d.address, mode: 'insensitive' },
        dismissed: false,
        promotedId: null,
      },
    });
    if (existing) continue;

    const deal = await prisma.scoutedDeal.create({
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
    created.push(deal);
  }

  return created;
}

export async function getScoutedDeals() {
  try {
    return await prisma.scoutedDeal.findMany({
      where: { dismissed: false, promotedId: null },
      orderBy: { createdAt: 'desc' },
    });
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

export async function promoteScoutedDeal(id: string) {
  const deal = await prisma.scoutedDeal.findUnique({ where: { id } });
  if (!deal) throw new Error('Scouted deal not found');

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

  const result = await analyzeProperty(syntheticMls);

  // Mark scouted deal as promoted
  await prisma.scoutedDeal.update({
    where: { id },
    data: { promotedId: result.id },
  });

  return { property: result, scoutedDeals: await getScoutedDeals() };
}
