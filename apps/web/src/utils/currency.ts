export const DEFAULT_CURRENCY = 'XOF';

export function formatFCFA(amount: string | number, withSuffix = true): string {
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const formatted = new Intl.NumberFormat('fr-SN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);

  return withSuffix ? `${formatted} FCFA` : formatted;
}

export function parseFCFA(formatted: string): string {
  return formatted.replace(/[^\d,-]/g, '').replace(',', '.');
}
