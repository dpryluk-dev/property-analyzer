---
description: Sync property listings from email into the ROI analyzer, then trash the emails
user_invocable: true
---

# Email Listing Sync

Fully automated pipeline that:
1. Fetches unread listing alert emails from Gmail
2. Extracts listing URLs (Zillow tracking links → canonical URLs)
3. Scrapes full listing details (address, price, HOA, beds/baths/sqft, year built) via ScraperAPI
4. Runs rent research via Claude web search
5. Runs full ROI analysis (cap rate, NOI, rating)
6. Saves each listing as a Property record in the database with the listing URL
7. Trashes the email once all its listings are imported

## Prerequisites

The following must be set in `.env`:

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
SCRAPER_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...
```

## Running manually

```bash
npx tsx --env-file=.env scripts/email-sync.ts --days 14
```

### Options
- `--days N` — look back N days (default: 3)
- `--dry-run` — extract and write JSON but skip DB import and email trashing
- `--no-trash` — import to DB but leave emails in inbox
- `--skip-db` — extract + scrape + write JSON only, no DB/Claude/trash
- `--query "..."` — custom Gmail search query

### Recommended first run

```bash
# See what would be processed without touching anything
npx tsx --env-file=.env scripts/email-sync.ts --days 14 --dry-run

# Import listings but keep emails for review
npx tsx --env-file=.env scripts/email-sync.ts --days 14 --no-trash

# Full pipeline (import + trash)
npx tsx --env-file=.env scripts/email-sync.ts --days 14
```

## Daily Automation (macOS launchd)

Install the daily agent to run every morning at 7 AM:

```bash
bash scripts/install-daily-sync.sh
```

This creates `~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist`, loads it, and runs the sync each morning with `--days 2` to catch anything new.

**Check logs**: `tail -f /tmp/email-listing-sync.log`

**Trigger manually**: `launchctl start com.pryluk.email-listing-sync`

**Uninstall**:
```bash
launchctl unload ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist
rm ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist
```

## How it works

### Data sources per listing
| Field | Source |
|---|---|
| Listing URL | Gmail email body (tracking link resolved to canonical Zillow URL) |
| Address, city, state, zip | Zillow `og:title` meta tag (via ScraperAPI) |
| Price, beds, baths, sqft | Zillow meta `description` tag (via ScraperAPI) |
| Year built, HOA, type | Zillow meta description + `__NEXT_DATA__` (via ScraperAPI) |
| Property tax | `__NEXT_DATA__` or 1.2%-of-price fallback in `analyze()` |
| Rent | Claude web search via `researchRent()` |
| Insurance, maintenance, CapEx | Formulas in `analyze()` based on price + type |
| Cap rate, NOI, rating | Computed by `analyze()` |

### Email handling
- Each unique canonical listing URL is only imported once (deduped by listing URL and address in the DB)
- An email is trashed only when **every** listing in it was successfully imported or was already in the portfolio
- Emails with even one failed import are left in the inbox for manual review

### Cost per run
- ScraperAPI: ~25 credits per Zillow page (premium proxy + JS render). 1000 free credits/month ≈ 40 listings
- Anthropic API: ~$0.03–0.05 per listing (Claude web search for rent research)
- Gmail API: free (within quotas)
