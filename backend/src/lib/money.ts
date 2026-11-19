export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const toRupees = (paise: number): number => paise / 100;

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

/** Integer percentage of an amount, rounded to the nearest whole rupee (matches how prices are displayed). */
export function percentOfWholeRupees(paise: number, percent: number): number {
  return Math.round((paise * percent) / 10000) * 100;
}
