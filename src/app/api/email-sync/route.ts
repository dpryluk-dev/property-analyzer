import { NextRequest, NextResponse } from 'next/server';
import { importListingsFromEmail, importSingleListing } from '@/lib/actions';

/**
 * POST /api/email-sync
 *
 * Accepts email body text and imports property listings found in it.
 *
 * Body (JSON):
 *   { "emailBody": "..." }          — parse and import all listings from email text
 *   { "listing": { ... } }          — import a single listing directly
 *   { "listings": [ { ... }, ... ] } — import multiple listings directly
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Mode 1: Raw email body — parse and import
    if (body.emailBody) {
      const result = await importListingsFromEmail(body.emailBody);
      return NextResponse.json(result);
    }

    // Mode 2: Single structured listing
    if (body.listing) {
      const result = await importSingleListing(body.listing);
      return NextResponse.json(result);
    }

    // Mode 3: Multiple structured listings
    if (body.listings && Array.isArray(body.listings)) {
      const results = [];
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const listing of body.listings) {
        const result = await importSingleListing(listing);
        if (result.success && !result.error) {
          imported++;
          results.push(result.property);
        } else if (result.error === 'Property already exists') {
          skipped++;
        } else {
          errors.push(`${listing.address}: ${result.error}`);
        }
      }

      return NextResponse.json({
        success: errors.length === 0,
        imported,
        skipped,
        errors,
        properties: results,
      });
    }

    return NextResponse.json(
      { error: 'Request must include "emailBody", "listing", or "listings"' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
