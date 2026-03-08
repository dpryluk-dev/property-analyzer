export interface RefiInputs {
  purchasePrice: number;
  propertyValue: number;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  closingCostsPct: number;
}

export interface RefiResult {
  monthlyPI: number;
  loanAmount: number;
  ltv: number;
  closingCosts: number;
  cashBackFromRefi: number;
  totalCashInvested: number;
  postRefiExpMo: number;
  postRefiNetMo: number;
  cashOnCash: number;
  dscr: number;
}

export function calculatePI(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round(principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

export function calculateRefi(
  inputs: RefiInputs,
  rentMo: number,
  existingExpMo: number,
): RefiResult {
  const monthlyPI = calculatePI(inputs.loanAmount, inputs.interestRate, inputs.loanTermYears);
  const ltv = inputs.propertyValue > 0 ? (inputs.loanAmount / inputs.propertyValue) * 100 : 0;
  const closingCosts = Math.round(inputs.loanAmount * (inputs.closingCostsPct / 100));
  const cashBackFromRefi = inputs.loanAmount - closingCosts;
  const totalCashInvested = Math.max(0, inputs.purchasePrice - cashBackFromRefi);

  const postRefiExpMo = existingExpMo + monthlyPI;
  const postRefiNetMo = rentMo - postRefiExpMo;

  const noi = rentMo - existingExpMo;
  const dscr = monthlyPI > 0 ? noi / monthlyPI : 99;

  const cashOnCash = totalCashInvested > 0
    ? ((postRefiNetMo * 12) / totalCashInvested) * 100
    : 0;

  return {
    monthlyPI, loanAmount: inputs.loanAmount, ltv, closingCosts,
    cashBackFromRefi, totalCashInvested,
    postRefiExpMo, postRefiNetMo, cashOnCash, dscr,
  };
}
