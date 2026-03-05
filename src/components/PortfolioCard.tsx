'use client';

import { useState, useMemo, useCallback } from 'react';
import { theme as C, fmt, pct, ratingColor } from '@/lib/theme';
import { analyze } from '@/lib/analysis';
import { generateShareImage } from './ShareImage';

interface PortfolioCardProps {
  item: any;
  expanded: boolean;
  onExpand: () => void;
  onRemove: () => void;
  onUpdate: (id: string, adjPrice: number, adjRent: number) => void;
}

export function PortfolioCard({ item, expanded, onExpand, onRemove, onUpdate }: PortfolioCardProps) {
  const p = item;
  const [ap, setAp] = useState(item.adjPrice || item.listPrice);
  const [ar, setAr] = useState(item.adjRent || item.rentResearch?.rent || 0);
  const rd = item.rentResearch;

  // Live recompute with local state
  const a = useMemo(() => analyze(p as any, ar, ap), [p, ar, ap]);
  const rc = ratingColor(a.rating);

  const commit = useCallback(() => {
    onUpdate(item.id, ap, ar);
  }, [ap, ar, item.id, onUpdate]);

  return (
    <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${expanded ? C.borderHi : C.border}`, overflow: 'hidden' }}>
      {/* Summary row */}
      <div onClick={onExpand} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{p.address || '?'}</div>
          <div style={{ fontSize: 10, color: C.dim }}>
            {[p.city, p.state, p.zip].filter(Boolean).join(', ')} | {p.bedrooms}BD/{p.bathrooms}BA{p.sqft ? ` | ${p.sqft}sf` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{fmt(ap)}</div>
            <div style={{ fontSize: 9, color: C.dim }}>Price</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: a.netMo >= 0 ? C.green : C.red }}>{fmt(a.netMo)}/mo</div>
            <div style={{ fontSize: 9, color: C.dim }}>Net</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: rc }}>{pct(a.capRate)}</div>
            <div style={{ fontSize: 9, color: C.dim }}>Cap</div>
          </div>
          <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 5, background: rc + '15', color: rc, fontSize: 10, fontWeight: 600 }}>{a.rating}</span>
          <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}>{'\u2715'}</button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }} className="fade-in">
          {/* Price & Rent Inputs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, padding: '10px 12px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 4 }}>Offer Price</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.accent}44`, borderRadius: 6, overflow: 'hidden' }}>
                <span style={{ padding: '0 8px', color: C.accent, fontSize: 14, fontWeight: 700 }}>$</span>
                <input type="number" value={ap || ''} onChange={e => setAp(parseFloat(e.target.value) || 0)} onBlur={commit}
                  className="mono" style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '8px 6px', fontSize: 16, outline: 'none' }} />
              </div>
              {ap !== p.listPrice && <div style={{ fontSize: 9, color: ap < p.listPrice ? C.green : C.yellow, marginTop: 2 }}>
                {ap < p.listPrice ? `${fmt(p.listPrice - ap)} below` : `${fmt(ap - p.listPrice)} above`} list ({fmt(p.listPrice)})
              </div>}
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 4 }}>Monthly Rent</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.green}44`, borderRadius: 6, overflow: 'hidden' }}>
                <span style={{ padding: '0 8px', color: C.green, fontSize: 14, fontWeight: 700 }}>$</span>
                <input type="number" value={ar || ''} onChange={e => setAr(parseFloat(e.target.value) || 0)} onBlur={commit}
                  className="mono" style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '8px 6px', fontSize: 16, outline: 'none' }} />
                <span style={{ padding: '0 8px', color: C.dim, fontSize: 12 }}>/mo</span>
              </div>
              {rd && <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>Research: {fmt(rd.low)} - {fmt(rd.high)}</div>}
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginTop: 10 }}>
            {[
              { label: 'Price', value: fmt(ap), hi: true },
              { label: 'Rent', value: fmt(ar) + '/mo', sub: rd ? `${fmt(rd.low)}-${fmt(rd.high)}` : '' },
              { label: 'Expenses', value: fmt(a.totalExpMo) + '/mo', sub: `${a.expRatio.toFixed(0)}% of rent` },
              { label: 'Net Cash Flow', value: fmt(a.netMo) + '/mo', sub: `${fmt(a.netMo * 12)}/yr`, hi: true },
            ].map((m, i) => (
              <div key={i} style={{ background: C.card, borderRadius: 10, padding: '14px 11px', border: `1px solid ${m.hi ? C.borderHi : C.border}` }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{m.label}</div>
                <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: m.hi ? C.accent : C.white }}>{m.value}</div>
                {m.sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{m.sub}</div>}
              </div>
            ))}
          </div>

          {/* Gauges */}
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8, margin: '10px 0', padding: '10px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
            {[
              { value: a.capRate, max: 10, label: 'Cap Rate' },
              { value: a.expRatio, max: 100, label: 'Exp Ratio', inv: true },
              { value: a.grm, max: 30, label: 'GRM', inv: true },
            ].map((g, i) => {
              const pv = Math.min(Math.max(g.value / g.max, 0), 1);
              const gc = g.inv ? (pv < 0.5 ? C.green : pv < 0.7 ? C.yellow : C.red) : (pv > 0.5 ? C.green : pv > 0.3 ? C.yellow : C.red);
              return (
                <div key={i} style={{ textAlign: 'center', flex: 1, minWidth: 70 }}>
                  <div style={{ position: 'relative', width: 76, height: 44, margin: '0 auto' }}>
                    <svg viewBox="0 0 120 66" width={76} height={44}>
                      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={C.border} strokeWidth={8} strokeLinecap="round" />
                      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={gc} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${pv * 157} 157`} />
                    </svg>
                    <div className="mono" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 13, fontWeight: 700, color: gc }}>{g.value.toFixed(1)}%</div>
                  </div>
                  <div style={{ fontSize: 9, color: C.dim, marginTop: 2, textTransform: 'uppercase' }}>{g.label}</div>
                </div>
              );
            })}
          </div>

          {/* Expenses */}
          <div style={{ marginTop: 10, fontSize: 10, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Monthly Expenses</div>
          {a.expenses.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 65px 36px', gap: 3, padding: '5px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <div><span style={{ fontSize: 12, color: C.text }}>{e.name}</span><br /><span style={{ fontSize: 9, color: C.dim }}>{e.note}</span></div>
              <span className="mono" style={{ fontSize: 12, color: C.text, textAlign: 'right' }}>{fmt(e.monthly)}</span>
              <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>{ar > 0 ? Math.round(e.monthly / ar * 100) + '%' : ''}</span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 65px 36px', padding: '7px 0 0', borderTop: `2px solid ${C.accent}`, marginTop: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>Total</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: C.red, textAlign: 'right' }}>{fmt(a.totalExpMo)}</span>
            <span style={{ fontSize: 9, color: C.dim, textAlign: 'right' }}>{a.expRatio.toFixed(0)}%</span>
          </div>

          {/* P&L */}
          <div style={{ marginTop: 10, padding: '8px 0' }}>
            {[
              { l: 'Gross Rent', v: ar, c: C.green },
              { l: 'Expenses', v: -a.totalExpMo, c: C.red },
              { l: 'Net', v: a.netMo, c: a.netMo >= 0 ? C.green : C.red, b: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: r.b ? `2px solid ${C.accent}` : 'none', borderBottom: r.b ? 'none' : `1px solid ${C.border}` }}>
                <span style={{ fontSize: r.b ? 13 : 12, fontWeight: r.b ? 700 : 400, color: r.b ? C.white : C.text }}>{r.l}</span>
                <span className="mono" style={{ fontSize: r.b ? 15 : 12, fontWeight: r.b ? 700 : 400, color: r.c }}>
                  {r.v < 0 ? '-' : ''}{fmt(Math.abs(r.v))}/mo
                </span>
              </div>
            ))}
          </div>

          {/* Rent comps */}
          {rd?.comps?.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>Comps</span>
                <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  background: rd.confidence === 'High' ? C.greenBg : rd.confidence === 'Medium' ? C.yellowBg : C.redBg,
                  color: rd.confidence === 'High' ? C.green : rd.confidence === 'Medium' ? C.yellow : C.red,
                }}>{rd.confidence}</span>
              </div>
              {rd.methodology && <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>{rd.methodology}</div>}
              {rd.comps.map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.text }}>{c.address} <span style={{ color: C.dim }}>{c.note}</span></span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{fmt(c.rent)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Observations */}
          {a.observations.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 0 0', borderTop: `1px solid ${C.border}` }}>
              {a.observations.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                  <span style={{ color: o.color === 'red' ? C.red : o.color === 'green' ? C.green : C.yellow, fontSize: 11 }}>
                    {o.icon === '!' ? '\u26A0' : '\u2713'}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>{o.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Verdict */}
          <div style={{ marginTop: 10, padding: '8px 10px', background: C.glow, borderRadius: 6, borderLeft: `3px solid ${rc}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>Verdict</span>
              <span style={{ padding: '2px 7px', borderRadius: 5, background: rc + '15', color: rc, fontSize: 10, fontWeight: 600 }}>{a.rating}</span>
            </div>
            <span style={{ fontSize: 11, color: C.text }}>
              {a.capRate >= 5 ? 'Solid deal. Verify and inspect.' : a.capRate >= 3.5 ? 'Borderline. Negotiate lower.' : a.capRate >= 2 ? 'Weak. Negotiate hard.' : "Doesn't work at this price."}
            </span>
          </div>

          {/* Share Image */}
          <button onClick={(e) => { e.stopPropagation(); generateShareImage(p, a, ap, ar, rd, rc); }}
            style={{ marginTop: 10, width: '100%', padding: '10px 0', background: `linear-gradient(135deg, ${C.accent}, #3B6FD9)`, color: C.white, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {'\uD83D\uDCF7'} Download Shareable Image
          </button>

          <div style={{ fontSize: 9, color: C.dim, marginTop: 6 }}>Analyzed {new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}
