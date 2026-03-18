import { getPortfolio, getScoutedDeals } from '@/lib/actions';
import { PropertyApp } from '@/components/PropertyApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let portfolio: Awaited<ReturnType<typeof getPortfolio>> = [];
  let scoutedDeals: Awaited<ReturnType<typeof getScoutedDeals>> = [];

  try {
    portfolio = await getPortfolio();
  } catch (e) {
    console.error('Failed to load portfolio:', e);
  }

  try {
    scoutedDeals = await getScoutedDeals();
  } catch (e) {
    console.error('Failed to load scouted deals:', e);
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#4F8CFF', textTransform: 'uppercase', letterSpacing: 3, fontWeight: 600 }}>
          Pryluk-Lewin
        </div>
        <h1 style={{
          fontSize: 24, fontWeight: 700, margin: '4px 0 0',
          background: 'linear-gradient(135deg, #FFF, #4F8CFF)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Real Estate Hub
        </h1>
      </div>
      <PropertyApp
        initialPortfolio={JSON.parse(JSON.stringify(portfolio))}
        initialScoutedDeals={JSON.parse(JSON.stringify(scoutedDeals))}
      />
    </main>
  );
}
