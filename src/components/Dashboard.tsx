'use client';

import { useMemo } from 'react';
import { theme as C, fmt, pct, stageColors, ratingColor } from '@/lib/theme';

interface DashboardProps {
  portfolio: any[];
}

export function Dashboard({ portfolio }: DashboardProps) {
  const metrics = useMemo(() => {
    if (portfolio.length === 0) return null;

    const totalNetMo = portfolio.reduce(
      (sum: number, p: any) => sum + (p.analysis?.netMo ?? 0),
      0,
    );

    const totalCapital = portfolio.reduce(
      (sum: number, p: any) =>
        sum + (p.purchasePrice ?? p.adjPrice ?? p.listPrice ?? 0),
      0,
    );

    const capRates = portfolio
      .map((p: any) => p.analysis?.capRate)
      .filter((v: any): v is number => typeof v === 'number');
    const avgCapRate =
      capRates.length > 0
        ? capRates.reduce((a: number, b: number) => a + b, 0) / capRates.length
        : 0;

    return { totalNetMo, totalCapital, avgCapRate };
  }, [portfolio]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of portfolio) {
      const stage = p.dealStage || 'Prospect';
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [portfolio]);

  if (portfolio.length === 0 || !metrics) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: C.muted,
          fontSize: 14,
        }}
      >
        No properties yet. Analyze one to see your dashboard.
      </div>
    );
  }

  const { totalNetMo, totalCapital, avgCapRate } = metrics;
  const totalNetAnnual = totalNetMo * 12;

  const capColor =
    avgCapRate >= 5 ? C.green : avgCapRate >= 3.5 ? C.yellow : C.red;

  const totalProperties = portfolio.length;
  const stageEntries = Object.entries(stageCounts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ---- Top Metric Cards ---- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        {[
          {
            label: 'Monthly Cash Flow',
            value: fmt(totalNetMo),
            sub: '/mo',
            color: totalNetMo >= 0 ? C.green : C.red,
          },
          {
            label: 'Annual Cash Flow',
            value: fmt(totalNetAnnual),
            sub: '/yr',
            color: totalNetAnnual >= 0 ? C.green : C.red,
          },
          {
            label: 'Capital Deployed',
            value: fmt(totalCapital),
            sub: '',
            color: C.accent,
          },
          {
            label: 'Avg Cap Rate',
            value: pct(avgCapRate),
            sub: '',
            color: capColor,
          },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              background: C.card,
              borderRadius: 10,
              padding: '16px 14px',
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: C.dim,
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {m.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span
                className="mono"
                style={{ fontSize: 22, fontWeight: 700, color: m.color }}
              >
                {m.value}
              </span>
              {m.sub && (
                <span style={{ fontSize: 11, color: C.dim }}>{m.sub}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Deal Stage Summary ---- */}
      <div
        style={{
          background: C.card,
          borderRadius: 10,
          padding: '14px 14px 10px',
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: C.dim,
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Deal Stages
        </div>

        {/* Segmented bar */}
        <div
          style={{
            display: 'flex',
            height: 18,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {stageEntries.map(([stage, count]) => {
            const widthPct = (count / totalProperties) * 100;
            const color = stageColors[stage] || C.dim;
            return (
              <div
                key={stage}
                style={{
                  width: `${widthPct}%`,
                  background: color,
                  minWidth: 4,
                  transition: 'width 0.3s ease',
                }}
                title={`${stage}: ${count}`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 8,
          }}
        >
          {stageEntries.map(([stage, count]) => {
            const color = stageColors[stage] || C.dim;
            return (
              <div
                key={stage}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: C.muted }}>
                  {stage}{' '}
                  <span style={{ fontWeight: 600, color: C.text }}>{count}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Mini Property Cards ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            fontSize: 9,
            color: C.dim,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Properties ({portfolio.length})
        </div>

        {portfolio.map((p: any) => {
          const netMo = p.analysis?.netMo ?? 0;
          const capRate = p.analysis?.capRate ?? 0;
          const price = p.purchasePrice ?? p.adjPrice ?? p.listPrice ?? 0;
          const stage = p.dealStage || 'Prospect';
          const stageColor = stageColors[stage] || C.dim;
          const netColor = netMo >= 0 ? C.green : C.red;
          const capClr =
            capRate >= 5 ? C.green : capRate >= 3.5 ? C.yellow : C.red;

          return (
            <div
              key={p.id}
              style={{
                background: C.card,
                borderRadius: 8,
                padding: '10px 12px',
                border: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              {/* Address */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 600, color: C.white }}
                >
                  {p.address || '?'}
                </div>
                <div style={{ fontSize: 10, color: C.dim }}>
                  {[p.city, p.state].filter(Boolean).join(', ')}
                </div>
              </div>

              {/* Price */}
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div
                  className="mono"
                  style={{ fontSize: 12, fontWeight: 700, color: C.accent }}
                >
                  {fmt(price)}
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>Price</div>
              </div>

              {/* Net Cash Flow */}
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div
                  className="mono"
                  style={{ fontSize: 12, fontWeight: 700, color: netColor }}
                >
                  {fmt(netMo)}/mo
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>Net</div>
              </div>

              {/* Cap Rate */}
              <div style={{ textAlign: 'right', minWidth: 50 }}>
                <div
                  className="mono"
                  style={{ fontSize: 12, fontWeight: 700, color: capClr }}
                >
                  {pct(capRate)}
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>Cap</div>
              </div>

              {/* Stage Badge */}
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 5,
                  background: stageColor + '20',
                  color: stageColor,
                  fontSize: 10,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
