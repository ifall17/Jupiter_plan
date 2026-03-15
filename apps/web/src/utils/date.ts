export function formatDate(
  date: string | Date,
  style: 'full' | 'short' | 'month-year' = 'full',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Record<'full' | 'short' | 'month-year', Intl.DateTimeFormatOptions> = {
    full: { day: 'numeric', month: 'long', year: 'numeric' },
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    'month-year': { month: 'long', year: 'numeric' },
  };

  return new Intl.DateTimeFormat('fr-SN', {
    ...options[style],
    timeZone: 'Africa/Dakar',
  }).format(d);
}

export function isDateInPeriod(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
