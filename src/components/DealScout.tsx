'use client';

import { useState, useTransition } from 'react';
import { theme as C, fmt, pct } from '@/lib/theme';
import { runDealScout, dismissScoutedDeal, promoteScoutedDeal, getScoutedDeals } from '@/lib/actions';

interface DealScoutProps {
  initialDeals: any[];
  onPromoted: (updated: any[]) => void;
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
        // Trigger parent to refresh portfolio
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
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            Boston Deal Scout
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
            AI-powered search for the best investment deals in Greater Boston
          </div>
        </div>
        <button
          onClick={handleScout}
          disabled={isPending}
          style={{
            background: isPending ? C.border : `linear-gradient(135deg, ${C.green}, #2AA87A)`,
            color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px',
            fontSize: 13, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isPending ? 'Scouting...' : 'Scout Deals Now'}
        </button>
      </div>

      {/* Status / Loading */}
      {isPending && status && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: `3px solid ${C.border}`, borderTopColor: C.green,
            animation: 'spin 1s linear infinite', margin: '0 auto 8px',
          }} />
          <div style={{ fontSize: 13, color: C.text }}>{status}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: C.redBg, borderRadius: 10, padding: 14, border: `1px solid ${C.red}33` }}>
          <span style={{ fontSize: 13, color: C.red }}>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {deals.length === 0 && !isPending && (
        <div style={{ textAlign: 'center', padding: 36, color: C.dim }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{'\uD83D\uDD0D'}</div>
          <div style={{ fontSize: 14 }}>No scouted deals yet. Hit "Scout Deals Now" to search.</div>
        </div>
      )}

      {/* Deal cards */}
      {deals.map((deal: any) => (
        <div key={deal.id} style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 18, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s',
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{deal.address}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                {[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}
                {deal.source && <span> &middot; {deal.source}</span>}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }} className="mono">
              {fmt(deal.price)}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {deal.bedrooms > 0 && (
              <Stat label="Beds" value={String(deal.bedrooms)} />
            )}
            {deal.bathrooms > 0 && (
              <Stat label="Baths" value={String(deal.bathrooms)} />
            )}
            {deal.sqft > 0 && (
              <Stat label="Sqft" value={deal.sqft.toLocaleString()} />
            )}
            <Stat label="Type" value={deal.type} />
            {deal.estimatedRent && (
              <Stat label="Est. Rent" value={fmt(deal.estimatedRent)} color={C.green} />
            )}
            {deal.estimatedCap != null && (
              <Stat
                label="Est. Cap"
                value={pct(deal.estimatedCap)}
                color={deal.estimatedCap >= 5 ? C.green : deal.estimatedCap >= 3.5 ? C.yellow : C.red}
              />
            )}
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
              <a
                href={deal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 500,
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                View Listing
              </a>
            )}
            <button
              onClick={() => handleDismiss(deal.id)}
              disabled={isPending}
              style={{
                padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.red, fontSize: 12, fontWeight: 500,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={() => handlePromote(deal.id)}
              disabled={isPending}
              style={{
                padding: '7px 14px', borderRadius: 6, border: 'none',
                background: `linear-gradient(135deg, ${C.accent}, #3B6FD9)`,
                color: C.white, fontSize: 12, fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Analyze & Add to Portfolio
            </button>
          </div>
        </div>
      ))}

      {/* Footer info */}
      {deals.length > 0 && (
        <div style={{ fontSize: 11, color: C.dim, textAlign: 'center', padding: 8 }}>
          {deals.length} deal{deals.length !== 1 ? 's' : ''} found &middot; Click "Analyze & Add to Portfolio" to run full analysis and move to deals pipeline
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: color || C.text }}>{value}</div>
    </div>
  );
}
