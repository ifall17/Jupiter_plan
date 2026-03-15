import { formatDate, isDateInPeriod } from './date';

describe('date utils', () => {
  it('formats full and month-year styles', () => {
    const full = formatDate('2025-01-15T00:00:00.000Z', 'full');
    const monthYear = formatDate('2025-01-15T00:00:00.000Z', 'month-year');

    expect(full.length).toBeGreaterThan(0);
    expect(monthYear.length).toBeGreaterThan(0);
  });

  it('checks inclusive period bounds', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-01-31T23:59:59.000Z');

    expect(isDateInPeriod(new Date('2025-01-01T00:00:00.000Z'), start, end)).toBe(true);
    expect(isDateInPeriod(new Date('2025-02-01T00:00:00.000Z'), start, end)).toBe(false);
  });
});
