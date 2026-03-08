'use client';

import { useState, useMemo } from 'react';
import { theme as C, fmt, pct, dscrColor } from '@/lib/theme';
import { calculateRefi } from '@/lib/refinance';
import { analyze } from '@/lib/analysis';

interface RefinanceCalcProps {
  portfolio: any[];
}

export function RefinanceCalc({ portfolio }: RefinanceCalcProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [propertyValue, setPropertyValue] = useState<number>(0);
  const [ltv, setLtv] = useState<number>(75);
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [interestRate, setInterestRate] = useState<number>(7.5);
  const [loanTerm, setLoanTerm] = useState<15 | 30>(30);
  const [closingCostsPct, setClosingCostsPct] = useState<number>(2.5);

  const selected = portfolio.find((p: any) => p.id === selectedId) || null;

  const handleSelectProperty = (id: string) => {
    setSelectedId(id);
    const prop = portfolio.find((p: any) => p.id === id);
    if (prop) {
      const val = prop.adjPrice || prop.listPrice || 0;
      setPropertyValue(val);
      const loan = Math.round(val * 0.75);
      setLtv(75);
      setLoanAmount(loan);
      setInterestRate(7.5);
      setLoanTerm(30);
      setClosingCostsPct(2.5);
    }
  };

  const handlePropertyValueChange = (val: number) => {
    setPropertyValue(val);
    setLoanAmount(Math.round(val * (ltv / 100)));
  };

  const handleLtvChange = (val: number) => {
    const clamped = Math.min(100, Math.max(0, val));
    setLtv(clamped);
    setLoanAmount(Math.round(propertyValue * (clamped / 100)));
  };

  const handleLoanAmountChange = (val: number) => {
    setLoanAmount(val);
    if (propertyValue > 0) {
      setLtv(Math.round((val / propertyValue) * 10000) / 100);
    }
  };

  const rentMo = selected
    ? (selected.adjRent || selected.rentResearch?.rent || 0)
    : 0;

  const cashAnalysis = useMemo(() => {
    if (!selected) return null;
    const price = selected.adjPrice || selected.listPrice || 0;
    return analyze(selected as any, rentMo, price);
  }, [selected, rentMo]);

  const refiResult = useMemo(() => {
    if (!selected || !cashAnalysis) return null;
    return calculateRefi(
      {
        purchasePrice: selected.purchasePrice || selected.adjPrice || selected.listPrice || 0,
        propertyValue,
        loanAmount,
        interestRate,
        loanTermYears: loanTerm,
        closingCostsPct,
      },
      rentMo,
      cashAnalysis.totalExpMo,
    );
  }, [selected, cashAnalysis, propertyValue, loanAmount, interestRate, loanTerm, closingCostsPct, rentMo]);

  // --- Empty state ---
  if (portfolio.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: C.dim }}>
        <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>{'\uD83C\uDFE6'}</div>
        <div style={{ fontSize: 14 }}>Analyze a property first to use the refinance calculator.</div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: C.bg,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: C.dim,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    display: 'block',
    marginBottom: 4,
  };

  const purchasePrice = selected
    ? (selected.purchasePrice || selected.adjPrice || selected.listPrice || 0)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Property Selector */}
      <div style={{ background: C.surface, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
        <div style={labelStyle}>Select Property</div>
        <select
          value={selectedId}
          onChange={e => handleSelectProperty(e.target.value)}
          style={{
            ...inputStyle,
            cursor: 'pointer',
            appearance: 'none' as const,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: 32,
          }}
        >
          <option value="" style={{ background: C.bg, color: C.dim }}>-- Choose a property --</option>
          {portfolio.map((p: any) => (
            <option key={p.id} value={p.id} style={{ background: C.bg, color: C.text }}>
              {p.address} - {fmt(p.adjPrice || p.listPrice)} | {p.analysis?.rating || '?'}
            </option>
          ))}
        </select>
      </div>

      {/* Loan Inputs */}
      {selected && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 14 }}>
            Loan Parameters
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {/* Property Value */}
            <div>
              <label style={labelStyle}>Property Value</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <span style={{ padding: '0 8px', color: C.accent, fontSize: 14, fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  value={propertyValue || ''}
                  onChange={e => handlePropertyValueChange(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '10px 6px', fontSize: 14, outline: 'none' }}
                />
              </div>
            </div>

            {/* LTV % */}
            <div>
              <label style={labelStyle}>LTV %</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={ltv}
                  onChange={e => handleLtvChange(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: C.accent }}
                />
                <input
                  type="number"
                  value={ltv}
                  onChange={e => handleLtvChange(parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: 70, textAlign: 'center', padding: '8px 4px' }}
                />
              </div>
            </div>

            {/* Loan Amount */}
            <div>
              <label style={labelStyle}>Loan Amount</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <span style={{ padding: '0 8px', color: C.accent, fontSize: 14, fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  value={loanAmount || ''}
                  onChange={e => handleLoanAmountChange(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '10px 6px', fontSize: 14, outline: 'none' }}
                />
              </div>
            </div>

            {/* Interest Rate */}
            <div>
              <label style={labelStyle}>Interest Rate %</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <input
                  type="number"
                  step={0.125}
                  value={interestRate}
                  onChange={e => setInterestRate(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '10px 12px', fontSize: 14, outline: 'none' }}
                />
                <span style={{ padding: '0 10px', color: C.dim, fontSize: 14 }}>%</span>
              </div>
            </div>

            {/* Loan Term */}
            <div>
              <label style={labelStyle}>Loan Term</label>
              <div style={{ display: 'flex', gap: 4, background: C.bg, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
                {([15, 30] as const).map(term => (
                  <button
                    key={term}
                    onClick={() => setLoanTerm(term)}
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: loanTerm === term ? C.accent : 'transparent',
                      color: loanTerm === term ? C.white : C.dim,
                    }}
                  >
                    {term}yr
                  </button>
                ))}
              </div>
            </div>

            {/* Closing Costs */}
            <div>
              <label style={labelStyle}>Closing Costs %</label>
              <div style={{ display: 'flex', alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <input
                  type="number"
                  step={0.25}
                  value={closingCostsPct}
                  onChange={e => setClosingCostsPct(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: C.white, padding: '10px 12px', fontSize: 14, outline: 'none' }}
                />
                <span style={{ padding: '0 10px', color: C.dim, fontSize: 14 }}>%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-side Comparison */}
      {selected && cashAnalysis && refiResult && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {/* CASH PURCHASE Column */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
            <div style={{
              fontSize: 10, color: C.dim, fontWeight: 700, textTransform: 'uppercase',
              marginBottom: 14, letterSpacing: 1, paddingBottom: 8,
              borderBottom: `2px solid ${C.accent}`,
            }}>
              Cash Purchase
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Purchase Price', value: fmt(purchasePrice), color: C.accent },
                { label: 'Monthly Rent', value: fmt(rentMo) + '/mo', color: C.green },
                { label: 'Monthly Expenses', value: fmt(cashAnalysis.totalExpMo) + '/mo', color: C.red },
                { label: 'Net Cash Flow', value: fmt(cashAnalysis.netMo) + '/mo', color: cashAnalysis.netMo >= 0 ? C.green : C.red },
                { label: 'Cap Rate', value: pct(cashAnalysis.capRate), color: cashAnalysis.capRate >= 5 ? C.green : cashAnalysis.capRate >= 3.5 ? C.yellow : C.red },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', background: C.card, borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Rating badge */}
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <span style={{
                display: 'inline-block', padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: (cashAnalysis.capRate >= 5 ? C.greenBg : cashAnalysis.capRate >= 3.5 ? C.yellowBg : C.redBg),
                color: cashAnalysis.capRate >= 5 ? C.green : cashAnalysis.capRate >= 3.5 ? C.yellow : C.red,
              }}>
                {cashAnalysis.rating}
              </span>
            </div>
          </div>

          {/* AFTER REFINANCE Column */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 18, border: `1px solid ${C.borderHi}` }}>
            <div style={{
              fontSize: 10, color: C.accent, fontWeight: 700, textTransform: 'uppercase',
              marginBottom: 14, letterSpacing: 1, paddingBottom: 8,
              borderBottom: `2px solid ${C.accent}`,
            }}>
              After Refinance
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Property Value', value: fmt(propertyValue), color: C.accent },
                { label: 'Monthly Rent', value: fmt(rentMo) + '/mo', color: C.green },
                { label: 'Base Expenses', value: fmt(cashAnalysis.totalExpMo) + '/mo', color: C.muted },
                { label: 'Monthly P&I', value: fmt(refiResult.monthlyPI) + '/mo', color: C.yellow },
                { label: 'Post-Refi Expenses', value: fmt(refiResult.postRefiExpMo) + '/mo', color: C.red },
                { label: 'Post-Refi Net', value: fmt(refiResult.postRefiNetMo) + '/mo', color: refiResult.postRefiNetMo >= 0 ? C.green : C.red },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', background: C.card, borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* CoC and DSCR */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <div style={{
                background: C.card, borderRadius: 10, padding: '12px 10px',
                border: `1px solid ${C.borderHi}`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Cash-on-Cash</div>
                <div style={{
                  fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: refiResult.cashOnCash >= 10 ? C.green : refiResult.cashOnCash >= 5 ? C.yellow : C.red,
                }}>
                  {pct(refiResult.cashOnCash)}
                </div>
              </div>
              <div style={{
                background: C.card, borderRadius: 10, padding: '12px 10px',
                border: `1px solid ${C.borderHi}`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>DSCR</div>
                <div style={{
                  fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: dscrColor(refiResult.dscr),
                }}>
                  {refiResult.dscr >= 99 ? 'N/A' : refiResult.dscr.toFixed(2)}x
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Recovery Summary */}
      {selected && refiResult && (
        <div style={{
          background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
          borderRadius: 12, padding: 18, border: `1px solid ${C.border}`,
        }}>
          <div style={{
            fontSize: 10, color: C.dim, fontWeight: 700, textTransform: 'uppercase',
            marginBottom: 14, letterSpacing: 1, paddingBottom: 8,
            borderBottom: `2px solid ${C.accent}`,
          }}>
            Cash Recovery Summary
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {/* Cash Invested */}
            <div style={{
              background: C.card, borderRadius: 10, padding: '14px 12px',
              border: `1px solid ${C.border}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Cash Invested
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.accent, fontFamily: "'DM Mono', monospace" }}>
                {fmt(purchasePrice)}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Purchase price</div>
            </div>

            {/* Refi Returns */}
            <div style={{
              background: C.card, borderRadius: 10, padding: '14px 12px',
              border: `1px solid ${C.border}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Refi Returns
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.green, fontFamily: "'DM Mono', monospace" }}>
                {fmt(refiResult.cashBackFromRefi)}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                Loan {fmt(loanAmount)} - Costs {fmt(refiResult.closingCosts)}
              </div>
            </div>

            {/* Cash Still Tied Up */}
            <div style={{
              background: C.card, borderRadius: 10, padding: '14px 12px',
              border: `1px solid ${refiResult.totalCashInvested <= 0 ? C.green : C.border}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Cash Still Tied Up
              </div>
              <div style={{
                fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                color: refiResult.totalCashInvested <= 0 ? C.green : C.yellow,
              }}>
                {refiResult.totalCashInvested <= 0 ? fmt(0) : fmt(refiResult.totalCashInvested)}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {refiResult.totalCashInvested <= 0 ? 'Full cash recovery!' : `${((refiResult.totalCashInvested / purchasePrice) * 100).toFixed(0)}% still in deal`}
              </div>
            </div>
          </div>

          {/* Recovery progress bar */}
          {purchasePrice > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.dim }}>Cash Recovery</span>
                <span style={{ fontSize: 10, color: C.muted }}>
                  {Math.min(100, Math.round((refiResult.cashBackFromRefi / purchasePrice) * 100))}%
                </span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (refiResult.cashBackFromRefi / purchasePrice) * 100)}%`,
                  background: refiResult.totalCashInvested <= 0
                    ? `linear-gradient(90deg, ${C.green}, ${C.accent})`
                    : `linear-gradient(90deg, ${C.accent}, ${C.yellow})`,
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
