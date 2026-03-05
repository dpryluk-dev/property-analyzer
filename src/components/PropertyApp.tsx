'use client';

import { useState, useTransition, useCallback } from 'react';
import { analyzeProperty, deleteProperty, updateAdjustments, getPortfolio } from '@/lib/actions';
import { theme as C, fmt, pct, ratingColor } from '@/lib/theme';
import { PortfolioCard } from './PortfolioCard';

interface PropertyAppProps {
  initialPortfolio: any[];
}

export function PropertyApp({ initialPortfolio }: PropertyAppProps) {
  const [raw, setRaw] = useState('');
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState(initialPortfolio.length > 0 ? 'portfolio' : 'analyze');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState('');

  const doAnalyze = useCallback(async () => {
    if (!raw.trim()) return;
    setError(null);
    setStatus('Parsing & researching rent...');
    startTransition(async () => {
      try {
        const result = await analyzeProperty(raw);
        const updated = await getPortfolio();
        setPortfolio(JSON.parse(JSON.stringify(updated)));
        setExpandedId(result.id);
        setTab('portfolio');
        setRaw('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed');
      } finally {
        setStatus('');
      }
    });
  }, [raw]);

  const handleDelete = useCallback(async (id: string) => {
    startTransition(async () => {
      await deleteProperty(id);
      const updated = await getPortfolio();
      setPortfolio(JSON.parse(JSON.stringify(updated)));
      if (expandedId === id) setExpandedId(null);
    });
  }, [expandedId]);

  const handleUpdate = useCallback(async (id: string, adjPrice: number, adjRent: number) => {
    startTransition(async () => {
      const updated = await updateAdjustments(id, adjPrice, adjRent);
      setPortfolio(JSON.parse(JSON.stringify(updated)));
    });
  }, []);

  const avgCap = portfolio.length > 0
    ? portfolio.reduce((s: number, p: any) => s + (p.analysis?.capRate || 0), 0) / portfolio.length
    : 0;

  const best = portfolio.length > 0
    ? portfolio.reduce((b: any, p: any) => (p.analysis?.capRate || 0) > (b.analysis?.capRate || 0) ? p : b, portfolio[0])
    : null;

  return (
    <>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: C.surface, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
        {(['analyze', 'portfolio'] as const).map(id => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
            cursor: 'pointer', background: tab === id ? C.accent : 'transparent',
            color: tab === id ? C.white : C.dim,
          }}>
            {id === 'analyze' ? 'Analyze New' : `Portfolio${portfolio.length ? ` (${portfolio.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Analyze Tab */}
      {tab === 'analyze' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
              Paste MLS Listing
            </div>
            <textarea
              value={raw} onChange={e => setRaw(e.target.value)}
              placeholder="Ctrl+A on the MLS page, then Ctrl+V here..."
              style={{
                width: '100%', minHeight: 130, background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: 12, color: C.text, fontSize: 12, lineHeight: 1.5,
                fontFamily: "'DM Mono', monospace", resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: C.dim }}>
                {raw.length > 0 ? raw.length.toLocaleString() + ' chars' : ''}
              </span>
              <button
                onClick={doAnalyze} disabled={isPending || !raw.trim()}
                style={{
                  background: isPending || !raw.trim() ? C.border : `linear-gradient(135deg, ${C.accent}, #3B6FD9)`,
                  color: C.white, border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14,
                  fontWeight: 600, cursor: isPending || !raw.trim() ? 'not-allowed' : 'pointer',
                  opacity: !raw.trim() ? 0.4 : 1,
                }}
              >
                {isPending ? 'Analyzing...' : 'Analyze & Save'}
              </button>
            </div>
          </div>

          {isPending && (
            <div style={{ textAlign: 'center', padding: 28 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: `3px solid ${C.border}`, borderTopColor: C.accent,
                animation: 'spin 1s linear infinite', margin: '0 auto 10px',
              }} />
              <div style={{ fontSize: 13, color: C.text }}>{status || 'Working...'}</div>
            </div>
          )}

          {error && (
            <div style={{ background: C.redBg, borderRadius: 10, padding: 14, border: `1px solid ${C.red}33` }}>
              <span style={{ fontSize: 13, color: C.red }}>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Tab */}
      {tab === 'portfolio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="fade-in">
          {portfolio.length > 0 && (
            <div style={{
              background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
              borderRadius: 10, padding: 14, border: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: 10,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Reviewed</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{portfolio.length}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Avg Cap</div>
                <div className="mono" style={{
                  fontSize: 18, fontWeight: 700,
                  color: avgCap >= 5 ? C.green : avgCap >= 3.5 ? C.yellow : C.red,
                }}>{pct(avgCap)}</div>
              </div>
              {best && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Best</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{best.address}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{pct(best.analysis?.capRate || 0)}</div>
                </div>
              )}
            </div>
          )}

          {portfolio.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, color: C.dim }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{'\uD83C\uDFE0'}</div>
              <div style={{ fontSize: 14 }}>No properties yet. Analyze one first.</div>
            </div>
          )}

          {portfolio.map((item: any) => (
            <PortfolioCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRemove={() => handleDelete(item.id)}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '14px 0', borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
        <div style={{ fontSize: 9, color: C.dim }}>All figures monthly. For analysis only.</div>
      </div>
    </>
  );
}
