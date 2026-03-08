import { getPortfolio } from '@/lib/actions';
import { PropertyApp } from '@/components/PropertyApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const portfolio = await getPortfolio();

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
      <PropertyApp initialPortfolio={JSON.parse(JSON.stringify(portfolio))} />
    </main>
  );
}
