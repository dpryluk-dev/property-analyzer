#!/usr/bin/env tsx
/**
 * Delete imported Zillow listings from the property analyzer.
 *
 * Targets properties that were imported via the email sync (identified by
 * having a zillow.com/homedetails URL in the listingUrl field).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/delete-imported-listings.ts            # dry run
 *   npx tsx --env-file=.env scripts/delete-imported-listings.ts --confirm  # actually delete
 *   npx tsx --env-file=.env scripts/delete-imported-listings.ts --all      # delete ALL Zillow-sourced listings
 *   npx tsx --env-file=.env scripts/delete-imported-listings.ts --days 7   # only those created in last 7 days
 */

import * as fs from 'fs';
import * as path from 'path';

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

import prisma from '../src/lib/db';

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const all = args.includes('--all');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 0 : 0;

  console.log('\n🗑  Delete imported listings\n');

  // Build where clause: match properties that were imported by the email-sync
  // script. We identify them via either:
  //   (a) listingUrl containing a real estate domain, OR
  //   (b) rawMls starting with our import markers
  const scriptImported = {
    OR: [
      { listingUrl: { contains: 'zillow.com' } },
      { listingUrl: { contains: 'redfin.com' } },
      { listingUrl: { contains: 'realtor.com' } },
      { rawMls: { startsWith: '[Imported from Zillow via email sync]' } },
      { rawMls: { startsWith: '[Imported from MLS via email sync]' } },
    ],
  };

  const where: any = { ...scriptImported };

  if (days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    where.createdAt = { gte: cutoff };
    console.log(`   Filter: script-imported, last ${days} days`);
  } else if (!all) {
    // Default: only today
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    where.createdAt = { gte: cutoff };
    console.log(`   Filter: script-imported, created today`);
  } else {
    console.log(`   Filter: all script-imported listings (no date filter)`);
  }

  // Preview what would be deleted
  const matches = await prisma.property.findMany({
    where,
    select: {
      id: true,
      address: true,
      city: true,
      listPrice: true,
      listingUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n   ${matches.length} properties would be deleted:\n`);

  for (const p of matches.slice(0, 50)) {
    const date = p.createdAt.toISOString().substring(0, 10);
    console.log(`   • [${date}] ${(p.address || 'Unknown').padEnd(35)} ${(p.city || '').padEnd(18)} $${p.listPrice.toLocaleString().padStart(9)}`);
  }
  if (matches.length > 50) {
    console.log(`   ... and ${matches.length - 50} more`);
  }

  if (matches.length === 0) {
    console.log('   Nothing to delete.');
    await prisma.$disconnect();
    return;
  }

  if (!confirm) {
    console.log('\n⚠️  Dry run. Re-run with --confirm to actually delete.');
    console.log('   Add --all to delete all imports (not just today).');
    console.log('   Add --days N to limit to the last N days.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n🔥 Deleting...');
  const result = await prisma.property.deleteMany({ where });
  console.log(`   ✅ Deleted ${result.count} properties (cascade removes their analysis, rent research, expenses, observations, and deal notes).`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(`\n❌ Error: ${e.message}`);
  await prisma.$disconnect();
  process.exit(1);
});
