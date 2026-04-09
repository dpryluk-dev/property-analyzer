#!/usr/bin/env tsx
/**
 * Check database status — count of properties and latest 5 entries.
 * Usage: npx tsx --env-file=.env scripts/db-status.ts
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
  console.log('\n🔍 Database status\n');
  console.log('   DATABASE_URL:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':***@'));
  console.log('');

  const count = await prisma.property.count();
  console.log(`   Total properties: ${count}`);

  if (count === 0) {
    console.log('\n   ⚠️  Portfolio is empty. Run: npx tsx --env-file=.env scripts/email-sync.ts --days 14');
    await prisma.$disconnect();
    return;
  }

  const withUrl = await prisma.property.count({ where: { listingUrl: { not: null } } });
  const withoutUrl = count - withUrl;
  console.log(`   With listingUrl:  ${withUrl}`);
  console.log(`   Without URL:      ${withoutUrl}`);

  const latest = await prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      address: true,
      city: true,
      listPrice: true,
      hoaFee: true,
      listingUrl: true,
      createdAt: true,
      rawMls: true,
    },
  });

  console.log('\n   Latest 10 properties:\n');
  for (const p of latest) {
    const date = p.createdAt.toISOString().substring(0, 16).replace('T', ' ');
    const urlMark = p.listingUrl ? '🔗' : '  ';
    const hoa = p.hoaFee ? ` · HOA $${p.hoaFee}` : '';
    console.log(`   ${urlMark} [${date}] ${(p.address || '?').padEnd(32).substring(0, 32)} ${(p.city || '').padEnd(14).substring(0, 14)} $${p.listPrice.toLocaleString().padStart(9)}${hoa}`);
    if (p.listingUrl) console.log(`        ${p.listingUrl.substring(0, 80)}`);
    const src = p.rawMls?.match(/^\[Imported from ([\w\s]+) via email sync\]/)?.[1] || 'manual/unknown';
    console.log(`        source: ${src}`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(`\n❌ Error: ${e.message}`);
  console.error(e.stack);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
