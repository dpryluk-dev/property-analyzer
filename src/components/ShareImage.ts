import type { AnalysisResult } from '@/lib/analysis';

export function generateShareImage(
  p: any,
  a: AnalysisResult,
  price: number,
  rent: number,
  rd: any,
  ratingColor: string,
) {
  const W = 1200, H = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const fv = (v: number) => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
  const rColor: Record<string, string> = { 'Strong Buy': '#34D399', Buy: '#34D399', Hold: '#FBBF24', Pass: '#F87171', 'Strong Pass': '#F87171' };
  const rc = rColor[a.rating] || '#FBBF24';

  // Background
  ctx.fillStyle = '#0C1017';
  ctx.fillRect(0, 0, W, H);
  const grd = ctx.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, 'rgba(79,140,255,0.06)');
  grd.addColorStop(1, 'rgba(52,211,153,0.04)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4F8CFF';
  ctx.fillRect(0, 0, W, 4);

  let y = 50;

  ctx.fillStyle = '#4F8CFF';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.fillText('INVESTMENT PROPERTY ANALYSIS', 60, y);

  const badgeW = ctx.measureText(a.rating).width + 32;
  ctx.fillStyle = rc + '22';
  ctx.beginPath(); ctx.roundRect(W - 60 - badgeW, 32, badgeW, 34, 6); ctx.fill();
  ctx.fillStyle = rc;
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillText(a.rating, W - 60 - badgeW + 16, 55);

  y += 38;
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 32px -apple-system, sans-serif';
  ctx.fillText(p.address || 'Property', 60, y);
  y += 24;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '16px -apple-system, sans-serif';
  ctx.fillText([p.city, p.state, p.zip].filter(Boolean).join(', ') + (p.complex ? ` - ${p.complex}` : ''), 60, y);
  y += 22;

  ctx.font = '13px -apple-system, sans-serif';
  const badges = [p.type, `${p.bedrooms}BD/${p.bathrooms}BA`, p.sqft ? `${p.sqft.toLocaleString()} sqft` : '', p.yearBuilt ? `Built ${p.yearBuilt}` : '', p.dom ? `${p.dom} DOM` : ''].filter(Boolean);
  let bx = 60;
  badges.forEach(b => {
    const tw = ctx.measureText(b).width + 20;
    ctx.fillStyle = 'rgba(79,140,255,0.12)';
    ctx.beginPath(); ctx.roundRect(bx, y - 2, tw, 24, 4); ctx.fill();
    ctx.fillStyle = '#4F8CFF';
    ctx.fillText(b, bx + 10, y + 14);
    bx += tw + 8;
  });
  y += 44;

  ctx.strokeStyle = '#2A3347'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
  y += 30;

  const metricBoxW = (W - 120 - 30) / 4;
  [
    { label: 'PURCHASE PRICE', value: fv(price), color: '#4F8CFF' },
    { label: 'MONTHLY RENT', value: fv(rent) + '/mo', color: '#34D399' },
    { label: 'MONTHLY EXPENSES', value: fv(a.totalExpMo) + '/mo', color: '#F87171' },
    { label: 'NET CASH FLOW', value: fv(a.netMo) + '/mo', color: a.netMo >= 0 ? '#34D399' : '#F87171' },
  ].forEach((m, i) => {
    const mx = 60 + i * (metricBoxW + 10);
    ctx.fillStyle = '#1B2230';
    ctx.beginPath(); ctx.roundRect(mx, y, metricBoxW, 80, 8); ctx.fill();
    ctx.strokeStyle = m.color + '44'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(mx, y, metricBoxW, 80, 8); ctx.stroke();
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillText(m.label, mx + 14, y + 22);
    ctx.fillStyle = m.color;
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText(m.value, mx + 14, y + 56);
  });
  y += 110;

  const gaugeW = (W - 120 - 20) / 3;
  [
    { label: 'CAP RATE', value: a.capRate, max: 10 },
    { label: 'EXPENSE RATIO', value: a.expRatio, max: 100, inv: true },
    { label: 'GRM', value: a.grm, max: 30, inv: true },
  ].forEach((g, i) => {
    const gx = 60 + i * (gaugeW + 10);
    const pv = Math.min(Math.max(g.value / g.max, 0), 1);
    const gc = g.inv ? (pv < 0.5 ? '#34D399' : pv < 0.7 ? '#FBBF24' : '#F87171') : (pv > 0.5 ? '#34D399' : pv > 0.3 ? '#FBBF24' : '#F87171');
    ctx.fillStyle = '#1B2230';
    ctx.beginPath(); ctx.roundRect(gx, y, gaugeW, 70, 8); ctx.fill();
    ctx.fillStyle = gc + '22';
    ctx.beginPath(); ctx.roundRect(gx + 14, y + 40, gaugeW - 28, 10, 4); ctx.fill();
    ctx.fillStyle = gc;
    ctx.beginPath(); ctx.roundRect(gx + 14, y + 40, (gaugeW - 28) * pv, 10, 4); ctx.fill();
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillText(g.label, gx + 14, y + 20);
    ctx.fillStyle = gc;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText(g.value.toFixed(1) + '%', gx + gaugeW - 14 - ctx.measureText(g.value.toFixed(1) + '%').width, y + 30);
  });
  y += 90;

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillText('MONTHLY EXPENSES BREAKDOWN', 60, y);
  y += 18;
  ctx.strokeStyle = '#2A3347'; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
  y += 6;

  a.expenses.forEach(e => {
    y += 26;
    ctx.fillStyle = '#E2E8F0'; ctx.font = '14px -apple-system, sans-serif';
    ctx.fillText(e.name, 70, y);
    ctx.fillStyle = '#64748B'; ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText(e.note.substring(0, 50), 70, y + 16);
    ctx.fillStyle = '#E2E8F0'; ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fv(e.monthly), W - 140, y);
    ctx.fillStyle = '#64748B'; ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(rent > 0 ? Math.round(e.monthly / rent * 100) + '%' : '', W - 70, y);
    ctx.textAlign = 'left';
    y += 12;
    ctx.strokeStyle = '#2A3347'; ctx.beginPath(); ctx.moveTo(60, y + 4); ctx.lineTo(W - 60, y + 4); ctx.stroke();
  });

  y += 28;
  ctx.fillStyle = '#4F8CFF'; ctx.fillRect(60, y - 16, W - 120, 2);
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillText('Total /month', 70, y + 4);
  ctx.fillStyle = '#F87171'; ctx.textAlign = 'right';
  ctx.fillText(fv(a.totalExpMo), W - 140, y + 4);
  ctx.fillStyle = '#64748B'; ctx.font = '13px -apple-system, sans-serif';
  ctx.fillText(a.expRatio.toFixed(0) + '%', W - 70, y + 4);
  ctx.textAlign = 'left';
  y += 30;

  ctx.fillStyle = '#64748B'; ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillText('MONTHLY P&L', 60, y);
  y += 20;
  [{ l: 'Gross Rent', v: rent, c: '#34D399' }, { l: 'Expenses', v: -a.totalExpMo, c: '#F87171' }].forEach(r => {
    ctx.fillStyle = '#E2E8F0'; ctx.font = '15px -apple-system, sans-serif';
    ctx.fillText(r.l, 70, y);
    ctx.fillStyle = r.c; ctx.font = 'bold 15px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((r.v < 0 ? '-' : '') + fv(Math.abs(r.v)) + '/mo', W - 70, y);
    ctx.textAlign = 'left';
    y += 28;
  });
  ctx.fillStyle = '#4F8CFF'; ctx.fillRect(60, y - 10, W - 120, 2);
  y += 8;
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 18px -apple-system, sans-serif';
  ctx.fillText('Net Cash Flow', 70, y);
  ctx.fillStyle = a.netMo >= 0 ? '#34D399' : '#F87171';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(fv(a.netMo) + '/mo', W - 70, y);
  ctx.textAlign = 'left';
  y += 40;

  ctx.fillStyle = rc + '11';
  ctx.beginPath(); ctx.roundRect(60, y, W - 120, 70, 8); ctx.fill();
  ctx.fillStyle = rc; ctx.fillRect(60, y, 4, 70);
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.fillText('Verdict: ' + a.rating, 80, y + 24);
  ctx.fillStyle = '#E2E8F0'; ctx.font = '14px -apple-system, sans-serif';
  const vt = a.capRate >= 5 ? 'Solid cash-flow investment.' : a.capRate >= 3.5 ? 'Borderline. Negotiate price down.' : a.capRate >= 2 ? 'Weak returns. Negotiate hard.' : 'Poor investment at this price.';
  ctx.fillText(vt, 80, y + 50);
  y += 90;

  ctx.fillStyle = '#2A3347'; ctx.fillRect(60, y, W - 120, 1);
  y += 16;
  ctx.fillStyle = '#64748B'; ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText('All figures monthly | For analysis purposes only', 60, y);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analysis-${(p.address || 'property').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
