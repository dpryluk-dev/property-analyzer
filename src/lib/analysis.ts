import type { ParsedProperty } from './parser';

export interface ExpenseItem {
  name: string;
  monthly: number;
  note: string;
}

export interface ObservationItem {
  color: string;
  icon: string;
  text: string;
}

export interface AnalysisResult {
  expenses: ExpenseItem[];
  totalExpMo: number;
  netMo: number;
  capRate: number;
  expRatio: number;
  grm: number;
  breakMo: number;
  rating: string;
  observations: ObservationItem[];
  priceSqft: number;
  rentSqft: number;
}

export function analyze(p: ParsedProperty, rentMo: number, priceOverride?: number): AnalysisResult {
  const price = priceOverride || p.listPrice || 0;
  const isCondo = /condo|unit/i.test(p.type || '');
  const hoaMo = p.hoaFee || 0;
  const hl = (p.hoaIncludes || '').toLowerCase();
  const hoaIns = /insurance|master/i.test(hl);
  const hoaExt = /exterior|maint|landscap|snow/i.test(hl);

  const taxMo = p.taxAnnual ? Math.round(p.taxAnnual / 12) : Math.round(price * 0.012 / 12);
  const taxNote = p.taxAnnual ? `$${p.taxAnnual.toLocaleString()}/yr` : 'Est. 1.2%';

  const insAnn = isCondo && hoaIns ? 500 : isCondo ? Math.round(price * 0.004) : Math.round(price * 0.006);
  const insMo = Math.round(insAnn / 12);
  const insNote = isCondo && hoaIns ? 'HO6 interior-only' : 'Est.';

  const mPct = isCondo && hoaExt ? 0.03 : isCondo ? 0.05 : 0.10;
  const maintMo = Math.round(rentMo * mPct);
  const vacMo = Math.round(rentMo * 0.05);
  const pmMo = Math.round(rentMo * 0.08);
  const capexMo = isCondo && hoaExt ? 75 : isCondo ? 100 : 250;

  const expenses: ExpenseItem[] = [
    { name: 'HOA / Condo Fee', monthly: hoaMo, note: hoaMo > 0 ? (p.hoaIncludes ? `Covers: ${p.hoaIncludes}` : 'Listed') : 'None' },
    { name: 'Property Tax', monthly: taxMo, note: taxNote },
    { name: 'Property Mgmt (8%)', monthly: pmMo, note: 'Opportunity cost' },
    { name: 'Vacancy (5%)', monthly: vacMo, note: '~1mo/20mo' },
    { name: 'CapEx Reserve', monthly: capexMo, note: hoaExt ? 'Interior only' : isCondo ? 'Condo' : 'House' },
    { name: 'Maintenance', monthly: maintMo, note: `${(mPct * 100).toFixed(0)}% rent` },
    { name: 'Insurance', monthly: insMo, note: insNote },
  ].filter(e => e.monthly > 0).sort((a, b) => b.monthly - a.monthly);

  const totalExpMo = expenses.reduce((s, e) => s + e.monthly, 0);
  const netMo = rentMo - totalExpMo;
  const capRate = price > 0 ? ((netMo * 12) / price) * 100 : 0;
  const expRatio = rentMo > 0 ? (totalExpMo / rentMo) * 100 : 0;
  const grm = rentMo > 0 ? price / (rentMo * 12) : 0;
  const breakMo = netMo > 0 ? Math.ceil(price / netMo) : 9999;

  const rating = capRate >= 7 ? 'Strong Buy' : capRate >= 5 ? 'Buy' : capRate >= 3.5 ? 'Hold' : capRate >= 2 ? 'Pass' : 'Strong Pass';

  const observations: ObservationItem[] = [];
  if (hoaMo > 0 && rentMo > 0 && hoaMo / rentMo > 0.25) {
    observations.push({ color: 'red', icon: '!', text: `HOA is ${(hoaMo / rentMo * 100).toFixed(0)}% of rent.${p.hoaIncludes ? ' Covers: ' + p.hoaIncludes : ''}` });
  }
  if (p.dom > 90) observations.push({ color: 'yellow', icon: '!', text: `${p.dom} DOM - negotiate.` });
  if (p.yearBuilt && p.yearBuilt < 1975) observations.push({ color: 'yellow', icon: '!', text: `Built ${p.yearBuilt} - check capital needs.` });
  if (capRate < 4) observations.push({ color: 'red', icon: '!', text: `Cap ${capRate.toFixed(1)}% below 4%.` });
  if (capRate >= 5) observations.push({ color: 'green', icon: '+', text: `Solid ${capRate.toFixed(1)}% cap.` });
  if (p.assessed && price < p.assessed) observations.push({ color: 'green', icon: '+', text: `Below assessed ($${p.assessed.toLocaleString()}).` });
  if (expRatio > 70) observations.push({ color: 'red', icon: '!', text: `${expRatio.toFixed(0)}% expense ratio.` });

  return {
    expenses, totalExpMo, netMo, capRate, expRatio, grm, breakMo, rating, observations,
    priceSqft: p.sqft > 0 ? price / p.sqft : 0,
    rentSqft: p.sqft > 0 ? rentMo / p.sqft : 0,
  };
}
