'use client';

import { useState, useTransition } from 'react';
import { theme as C, fmt, pct } from '@/lib/theme';
import { analyze } from '@/lib/analysis';
import { runDealScout, dismissScoutedDeal, promoteScoutedDeal, getScoutedDeals } from '@/lib/actions';

interface DealScoutProps {
  initialDeals: any[];
  onPromoted: (updated: any[]) => void;
}

function computeDealMetrics(deal: any) {
  const rentMo = deal.estimatedRent || 0;
  return analyze({
    listPrice: deal.price || 0,
    type: deal.type || 'Condo',
    hoaFee: 0,
    hoaIncludes: '',
    taxAnnual: 0,
    sqft: deal.sqft || 0,
    dom: 0,
    yearBuilt: 0,
    assessed: 0,
    bedrooms: deal.bedrooms || 0,
    bathrooms: deal.bathrooms || 0,
  } as any, rentMo, deal.price);
}

export function DealScout({ initialDeals, onPromoted }: DealScoutProps) {
  const [deals, setDeals] = useState(initialDeals);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleScout() {
    setError(null);
    setStatus('Searching Boston listings...');
    startTransition(async () => {
      try {
        const result = await runDealScout();
        if (!result.success) {
          setError(result.error || 'Scout search failed');
          setStatus('');
          return;
        }
        const updated = await getScoutedDeals();
        setDeals(JSON.parse(JSON.stringify(updated)));
        setStatus('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scout search failed');
        setStatus('');
      }
    });
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      const updated = await dismissScoutedDeal(id);
      setDeals(JSON.parse(JSON.stringify(updated)));
    });
  }

  function handlePromote(id: string) {
    setStatus('Analyzing & adding to portfolio...');
    startTransition(async () => {
      try {
        const result = await promoteScoutedDeal(id);
        if (!result.success) {
          setError(result.error || 'Failed to promote deal');
          setStatus('');
          return;
        }
        setDeals(JSON.parse(JSON.stringify(result.scoutedDeals || [])));
        const { getPortfolio } = await import('@/lib/actions');
        const portfolio = await getPortfolio();
        onPromoted(JSON.parse(JSON.stringify(portfolio)));
        setStatus('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to promote deal');
        setStatus('');
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
        borderRadius: 12, padding: 18, border: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Boston Deal Scout</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Live Redfin listings &middot; Best investment deals in Greater Boston &middot; Under $300K</div>
        </div>
        <button onClick={handleScout} disabled={isPending} style={{
          background: isPending ? C.border : `linear-gradient(135deg, ${C.green}, #2AA87A)`,
          color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px',
          fontSize: 13, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}>
          {isPending ? 'Scouting...' : 'Scout Deals Now'}
        </button>
      </div>

      {isPending && status && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.green, animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: C.text }}>{status}</div>
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, borderRadius: 10, padding: 14, border: `1px solid ${C.red}33` }}>
          <span style={{ fontSize: 13, color: C.red }}>{error}</span>
        </div>
      )}

      {deals.length === 0 && !isPending && (
        <div style={{ textAlign: 'center', padding: 36, color: C.dim }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{'\uD83D\uDD0D'}</div>
          <div style={{ fontSize: 14 }}>No scouted deals yet. Hit &quot;Scout Deals Now&quot; to search.</div>
        </div>
      )}

      {deals.map((deal: any) => (
        <DealCard key={deal.id} deal={deal} isPending={isPending} onDismiss={handleDismiss} onPromote={handlePromote} />
      ))}

      {deals.length > 0 && (
        <div style={{ fontSize: 11, color: C.dim, textAlign: 'center', padding: 8 }}>
          {deals.length} deal{deals.length !== 1 ? 's' : ''} found &middot; Click &quot;Analyze &amp; Add to Portfolio&quot; to run full analysis
        </div>
      )}
    </div>
  );
}

function DealCard({ deal, isPending, onDismiss, onPromote }: { deal: any; isPending: boolean; onDismiss: (id: string) => void; onPromote: (id: string) => void }) {
  const a = computeDealMetrics(deal);
  const rentMo = deal.estimatedRent || 0;
  const noiColor = a.noiPer100k >= 5000 ? C.green : a.noiPer100k >= 3500 ? C.yellow : C.red;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 18, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s',
    }}>
      {/* Top row: address + NOI/100K badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{deal.address}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}
            {deal.source && <span> &middot; {deal.source}</span>}
          </div>
        </div>
        <div style={{
          textAlign: 'center', padding: '4px 12px', borderRadius: 8,
          background: `linear-gradient(135deg, ${noiColor}18, ${noiColor}08)`,
          border: `1px solid ${noiColor}44`,
        }}>
          <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: noiColor }}>
            {fmt(Math.round(a.noiPer100k))}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>NOI / $100K</div>
        </div>
      </div>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6, marginBottom: 12 }}>
        <MetricBox label="Price" value={fmt(deal.price)} color={C.accent} />
        <MetricBox label="Est. Rent" value={fmt(rentMo) + '/mo'} color={C.green} />
        <MetricBox label="NOI" value={fmt(a.noiAnnual) + '/yr'} color={a.noiAnnual >= 0 ? C.green : C.red} />
        <MetricBox label="Cap Rate" value={pct(a.capRate)} color={a.capRate >= 5 ? C.green : a.capRate >= 3.5 ? C.yellow : C.red} />
        <MetricBox label="Exp Ratio" value={a.expRatio.toFixed(0) + '%'} color={a.expRatio <= 50 ? C.green : a.expRatio <= 65 ? C.yellow : C.red} />
        <MetricBox label="GRM" value={a.grm.toFixed(1)} color={a.grm <= 15 ? C.green : a.grm <= 20 ? C.yellow : C.red} />
      </div>

      {/* Property details */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, fontSize: 11, color: C.dim }}>
        {deal.bedrooms > 0 && <span>{deal.bedrooms} bed</span>}
        {deal.bathrooms > 0 && <span>{deal.bathrooms} bath</span>}
        {deal.sqft > 0 && <span>{deal.sqft.toLocaleString()} sqft</span>}
        <span>{deal.type}</span>
        {a.netMo !== 0 && <span style={{ color: a.netMo >= 0 ? C.green : C.red, fontWeight: 600 }}>Net: {fmt(a.netMo)}/mo</span>}
      </div>

      {/* Highlight */}
      {deal.highlight && (
        <div style={{
          background: C.surface, borderRadius: 8, padding: 10,
          fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12,
          borderLeft: `3px solid ${C.accent}`,
        }}>
          {deal.highlight}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {deal.sourceUrl && (
          <a href={deal.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
            padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 500,
            textDecoration: 'none', cursor: 'pointer',
          }}>
            View Listing
          </a>
        )}
        <button onClick={() => onDismiss(deal.id)} disabled={isPending} style={{
          padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
          background: 'transparent', color: C.red, fontSize: 12, fontWeight: 500,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}>
          Dismiss
        </button>
        <button onClick={() => onPromote(deal.id)} disabled={isPending} style={{
          padding: '7px 14px', borderRadius: 6, border: 'none',
          background: `linear-gradient(135deg, ${C.accent}, #3B6FD9)`,
          color: C.white, fontSize: 12, fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}>
          Analyze &amp; Add to Portfolio
        </button>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.surface, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 8, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
