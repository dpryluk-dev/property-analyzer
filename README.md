# Property Analyzer - Cash Purchase ROI Engine

Investment property analysis tool with AI-powered rent research, SQLite database, and shareable image generation.

## Features

- **MLS Parser**: Paste any MLSpin/VOW listing text, auto-extracts all property details
- **AI Rent Research**: Uses Claude with web search to find same-building rental comps
- **Full Analysis**: Monthly expenses, cap rate, GRM, expense ratio, P&L, observations
- **Portfolio Tracker**: Save and compare multiple properties with SQLite persistence
- **Adjustable Inputs**: Override price and rent to model scenarios
- **Shareable Images**: Generate PNG cards for each analysis

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Actions)
- **Database**: SQLite via Prisma ORM (swap to Postgres for production)
- **AI**: Anthropic Claude API with web_search tool
- **Language**: TypeScript
- **Styling**: Inline styles with design token system

## Setup

```bash
# Clone and install
git clone <your-repo>
cd property-analyzer
npm install

# Configure environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Initialize database
npx prisma db push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
property-analyzer/
├── prisma/
│   └── schema.prisma          # Database schema (Property, Analysis, RentResearch, etc.)
├── src/
│   ├── app/
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Main page (server component)
│   ├── components/
│   │   ├── PropertyApp.tsx    # Client app shell (tabs, analyze form, portfolio list)
│   │   ├── PortfolioCard.tsx  # Expandable property card with full analysis
│   │   └── ShareImage.ts     # Canvas-based PNG image generator
│   └── lib/
│       ├── actions.ts         # Server actions (analyze, CRUD operations)
│       ├── analysis.ts        # Expense calculation, cap rate, rating engine
│       ├── db.ts              # Prisma client singleton
│       ├── parser.ts          # MLS text parser (regex-based)
│       ├── rent-research.ts   # Anthropic API + web_search for rent comps
│       └── theme.ts           # Design tokens and formatters
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
└── tsconfig.json
```

## Database

Default: SQLite (file-based, zero config).

To switch to Postgres, update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

And set `DATABASE_URL` in `.env` to your Postgres connection string.

## Key Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npx prisma studio    # Visual database browser
npx prisma db push   # Push schema changes to DB
```

## All-Cash Analysis Assumptions

- Property tax: from listing or 1.2% estimated
- Insurance: HO6 ($500/yr) if condo with master policy, else 0.4-0.6% of value
- Maintenance: 3% of rent (condo with HOA exterior) to 10% (house)
- Vacancy: 5% (1 month per 20)
- Property management: 8% (opportunity cost)
- CapEx: $75-250/mo depending on HOA coverage
- HOA-aware: auto-adjusts when HOA covers heat, water, insurance, exterior

## Rating Scale

| Cap Rate | Rating      |
|----------|-------------|
| >= 7%    | Strong Buy  |
| >= 5%    | Buy         |
| >= 3.5%  | Hold        |
| >= 2%    | Pass        |
| < 2%     | Strong Pass |
