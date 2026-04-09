---
description: Delete previously-imported Zillow listings from the property analyzer database
user_invocable: true
---

# Delete Imported Listings

Removes properties that were imported by the email-listing-sync skill. Use this when:
- A sync run imported bad or incomplete data and you want to re-run it
- You want to clean up test imports before a production run
- You want to clear today's imports and retry

## Dry run (preview what would be deleted)

```bash
npx tsx --env-file=.env scripts/delete-imported-listings.ts
```

By default this shows properties imported **today** without deleting anything.

## Delete today's imports

```bash
npx tsx --env-file=.env scripts/delete-imported-listings.ts --confirm
```

## Delete all Zillow-imported properties (use with care)

```bash
npx tsx --env-file=.env scripts/delete-imported-listings.ts --all --confirm
```

## Delete imports from the last N days

```bash
npx tsx --env-file=.env scripts/delete-imported-listings.ts --days 3 --confirm
```

## What gets deleted

Only properties that have a `zillow.com/homedetails` URL in their `listingUrl` field (i.e. were imported by the email sync). Manual entries without a listing URL are untouched.

Cascade delete removes:
- The Property row
- Its linked `RentResearch` + `RentComp`
- Its linked `Analysis` + `Expense` + `Observation`
- Any `DealNote` records

## Typical re-run flow

```bash
# 1. Clear today's bad imports
npx tsx --env-file=.env scripts/delete-imported-listings.ts --confirm

# 2. Re-run the sync
npx tsx --env-file=.env scripts/email-sync.ts --days 14
```

## Safety

- Dry run is the default — you must pass `--confirm` to actually delete
- Scope defaults to "today" — you must pass `--all` or `--days N` to widen
- Manual portfolio entries (no listing URL) are never touched
