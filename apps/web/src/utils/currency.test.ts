import { formatFCFA, parseFCFA } from './currency';

describe('currency utils', () => {
  it('formats amount with FCFA suffix by default', () => {
    expect(formatFCFA(1250000)).toContain('FCFA');
  });

  it('formats without suffix when requested', () => {
    expect(formatFCFA('5000', false)).not.toContain('FCFA');
  });

  it('parses formatted strings to numeric-like payload', () => {
    expect(parseFCFA('1 234 567 FCFA')).toBe('1234567');
    expect(parseFCFA('12,5 FCFA')).toBe('12.5');
  });
});
