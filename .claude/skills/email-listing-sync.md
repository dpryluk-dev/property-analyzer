---
description: Sync property listings from email into the ROI analyzer
user_invocable: true
---

# Email Listing Sync

Sync property listings received via email into the property ROI analyzer. This skill fetches listing alert emails (Zillow, Redfin, Realtor.com, MLS, agent emails), extracts property data, runs full ROI analysis, and saves them to the portfolio with listing URLs.

## Prerequisites

The app must be running (`npm run dev`) for the API import to work. Gmail API credentials must be configured for automated email fetching.

## Workflow

### Option A: Automated Gmail Sync (if credentials are configured)

1. Check if Gmail credentials exist in `.env`:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`

2. If credentials exist, run the sync script:
   ```bash
   npx tsx scripts/email-sync.ts --days 3
   ```

3. Review the output and report what was imported.

### Option B: Manual Email Paste (if no Gmail credentials)

1. Ask the user to paste the email body text (or forward the email content).

2. Use the API to import listings. Send a POST request to the running app:
   ```bash
   curl -X POST http://localhost:3000/api/email-sync \
     -H "Content-Type: application/json" \
     -d '{"emailBody": "<pasted email content>"}'
   ```

3. Report what was imported (count, addresses, cap rates).

### Option C: Direct Listing Import

If the user provides listing details directly (address, price, URL), import them one at a time:

```bash
curl -X POST http://localhost:3000/api/email-sync \
  -H "Content-Type: application/json" \
  -d '{"listing": {"address": "123 Main St", "city": "Boston", "state": "MA", "zip": "02101", "price": 350000, "bedrooms": 2, "bathrooms": 1, "sqft": 850, "listingUrl": "https://..."}}'
```

## Running Daily (Automation)

To run the sync every morning automatically on macOS, install a launchd agent:

```bash
# Create the launchd plist
cat > ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pryluk.email-listing-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd /ABSOLUTE/PATH/TO/property-analyzer && /usr/local/bin/npx tsx --env-file=.env scripts/email-sync.ts --days 2 >> /tmp/email-sync.log 2>&1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# Load it
launchctl load ~/Library/LaunchAgents/com.pryluk.email-listing-sync.plist
```

This runs the sync every day at 7:00 AM, looking back 2 days to catch anything new. Logs go to `/tmp/email-sync.log`.

**Requirements**: The app must be running (`npm run dev` or deployed). For a deployed app, set `APP_URL` in `.env` to the deployed URL instead of localhost.

**Alternative**: Use GitHub Actions with a scheduled workflow, or Render.com cron jobs, if you want it to run server-side without your laptop being on.

## Supported Email Sources

- **Zillow** — "New listings" and "Price reduced" alerts
- **Redfin** — "New homes" and "Price drop" alerts  
- **Realtor.com** — Listing alert emails
- **MLS Direct** — Agent MLS listing emails
- **Generic** — Any email with property URLs and price/address data

## What Gets Imported

For each listing found in the email:
1. Property details (address, price, beds/baths, sqft)
2. Listing URL (direct link back to the source)
3. AI-powered rent estimate (via Anthropic API)
4. Full ROI analysis (cap rate, NOI, expenses, rating)
5. Saved to portfolio as a new "Prospect" deal

Duplicate properties (same address) are automatically skipped. If a duplicate is found but was missing a listing URL, the URL gets backfilled.

## Gmail API Setup (One-Time)

If the user needs to set up Gmail API access:

1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable the **Gmail API**
4. Create **OAuth 2.0 credentials** (Desktop application type)
5. Run the OAuth flow to get a refresh token
6. Add to `.env`:
   ```
   GMAIL_CLIENT_ID=your-client-id
   GMAIL_CLIENT_SECRET=your-client-secret
   GMAIL_REFRESH_TOKEN=your-refresh-token
   ```

## Output

After syncing, report:
- Number of listings imported
- Number of duplicates skipped
- For each imported property: address, price, cap rate, rating, and listing URL
- Any errors encountered
