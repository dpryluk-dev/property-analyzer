'use client';

import { useState, useMemo } from 'react';
import { theme as C, fmt, pct, ratingColor } from '@/lib/theme';
import { analyze } from '@/lib/analysis';

interface ScenarioModelerProps {
  portfolio: any[];
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function ScenarioModeler({ portfolio }: ScenarioModelerProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = portfolio.find((p) => p.id === selectedId) || null;

  const adjPrice = selected ? (selected.adjPrice || selected.listPrice || 0) : 0;
  const adjRent = selected ? (selected.adjRent || selected.rentResearch?.rent || 0) : 0;
  const rd = selected?.rentResearch;

  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [priceStep, setPriceStep] = useState(10000);
  const [rentMin, setRentMin] = useState(0);
  const [rentMax, setRentMax] = useState(0);
  const [rentStep, setRentStep] = useState(100);

  // Reset range defaults when property changes
  const handleSelect = (id: string) => {
    setSelectedId(id);
    const prop = portfolio.find((p) => p.id === id);
    if (prop) {
      const ap = prop.adjPrice || prop.listPrice || 0;
      const ar = prop.adjRent || prop.rentResearch?.rent || 0;
      const r = prop.rentResearch;
      setPriceMin(roundTo(ap * 0.85, 10000));
      setPriceMax(roundTo(ap * 1.05, 10000));
      setPriceStep(10000);
      setRentMin(roundTo(r?.low || ar * 0.85, 50));
      setRentMax(roundTo(r?.high || ar * 1.15, 50));
      setRentStep(100);
    }
  };

  // Build sensitivity grid
  const grid = useMemo(() => {
    if (!selected || priceStep <= 0 || rentStep <= 0) return null;

    const prices: number[] = [];
    for (let p = priceMin; p <= priceMax; p += priceStep) {
      prices.push(p);
    }
    const rents: number[] = [];
    for (let r = rentMin; r <= rentMax; r += rentStep) {
      rents.push(r);
    }

    if (prices.length === 0 || rents.length === 0) return null;

    let bestCap = -Infinity;
    let worstCap = Infinity;
    let bestCombo = { price: 0, rent: 0, capRate: 0, rating: '' };
    let worstCombo = { price: 0, rent: 0, capRate: 0, rating: '' };

    const rows = prices.map((price) => {
      const cells = rents.map((rent) => {
        const result = analyze(selected as any, rent, price);
        const { capRate, rating } = result;
        if (capRate > bestCap) {
          bestCap = capRate;
          bestCombo = { price, rent, capRate, rating };
        }
        if (capRate < worstCap) {
          worstCap = capRate;
          worstCombo = { price, rent, capRate, rating };
        }
        return { price, rent, capRate, rating };
      });
      return { price, cells };
    });

    const currentResult = analyze(selected as any, adjRent, adjPrice);

    return { prices, rents, rows, bestCombo, worstCombo, current: { price: adjPrice, rent: adjRent, capRate: currentResult.capRate, rating: currentResult.rating } };
  }, [selected, priceMin, priceMax, priceStep, rentMin, rentMax, rentStep, adjPrice, adjRent]);

  if (portfolio.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 14 }}>
        Analyze a property first to model scenarios.
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.white,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: C.dim,
    textTransform: 'uppercase',
    fontWeight: 600,
    display: 'block',
    marginBottom: 4,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Property Selector */}
      <div>
        <label style={labelStyle}>Select Property</label>
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          style={{
            ...inputStyle,
            cursor: 'pointer',
            appearance: 'auto',
          }}
        >
          <option value="">-- Choose a property --</option>
          {portfolio.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}{p.city ? `, ${p.city}` : ''} — {fmt(p.adjPrice || p.listPrice)}
            </option>
          ))}
        </select>
      </div>

      {/* Range Inputs */}
      {selected && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          padding: '12px 14px',
          background: C.surface,
          borderRadius: 8,
          border: `1px solid ${C.border}`,
        }}>
          <div>
            <label style={labelStyle}>Price Min</label>
            <input type="number" value={priceMin} onChange={(e) => setPriceMin(Number(e.target.value) || 0)} className="mono" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Price Max</label>
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value) || 0)} className="mono" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Price Step</label>
            <input type="number" value={priceStep} onChange={(e) => setPriceStep(Number(e.target.value) || 10000)} className="mono" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rent Min</label>
            <input type="number" value={rentMin} onChange={(e) => setRentMin(Number(e.target.value) || 0)} className="mono" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rent Max</label>
            <input type="number" value={rentMax} onChange={(e) => setRentMax(Number(e.target.value) || 0)} className="mono" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rent Step</label>
            <input type="number" value={rentStep} onChange={(e) => setRentStep(Number(e.target.value) || 100)} className="mono" style={inputStyle} />
          </div>
        </div>
      )}

      {/* Sensitivity Table */}
      {grid && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontSize: 12,
          }}>
            <thead>
              <tr>
                <th style={{
                  padding: 8,
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  color: C.muted,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  textAlign: 'left',
                }}>
                  Price \ Rent
                </th>
                {grid.rents.map((rent) => (
                  <th key={rent} className="mono" style={{
                    padding: 8,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    color: C.muted,
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {fmt(rent)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.price}>
                  <td className="mono" style={{
                    padding: 8,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    color: C.muted,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {fmt(row.price)}
                  </td>
                  {row.cells.map((cell) => {
                    const rc = ratingColor(cell.rating);
                    const isCurrent = cell.price === adjPrice && cell.rent === adjRent;
                    return (
                      <td key={`${cell.price}-${cell.rent}`} className="mono" style={{
                        padding: 8,
                        border: isCurrent ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                        background: rc + '26',
                        color: rc,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}>
                        {pct(cell.capRate)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Cards */}
      {grid && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}>
          {/* Best Case */}
          {(() => {
            const rc = ratingColor(grid.bestCombo.rating);
            return (
              <div style={{
                background: C.card,
                borderRadius: 8,
                padding: '14px 12px',
                border: `1px solid ${C.green}44`,
              }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Best Case</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.green, marginBottom: 4 }}>
                  {pct(grid.bestCombo.capRate)}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>
                  {fmt(grid.bestCombo.price)} / {fmt(grid.bestCombo.rent)}/mo
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: rc + '15',
                  color: rc,
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  {grid.bestCombo.rating}
                </span>
              </div>
            );
          })()}

          {/* Expected */}
          {(() => {
            const rc = ratingColor(grid.current.rating);
            return (
              <div style={{
                background: C.card,
                borderRadius: 8,
                padding: '14px 12px',
                border: `1px solid ${C.accent}44`,
              }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Expected</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
                  {pct(grid.current.capRate)}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>
                  {fmt(grid.current.price)} / {fmt(grid.current.rent)}/mo
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: rc + '15',
                  color: rc,
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  {grid.current.rating}
                </span>
              </div>
            );
          })()}

          {/* Worst Case */}
          {(() => {
            const rc = ratingColor(grid.worstCombo.rating);
            return (
              <div style={{
                background: C.card,
                borderRadius: 8,
                padding: '14px 12px',
                border: `1px solid ${C.red}44`,
              }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Worst Case</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.red, marginBottom: 4 }}>
                  {pct(grid.worstCombo.capRate)}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>
                  {fmt(grid.worstCombo.price)} / {fmt(grid.worstCombo.rent)}/mo
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: rc + '15',
                  color: rc,
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  {grid.worstCombo.rating}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
