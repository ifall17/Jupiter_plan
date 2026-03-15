import { act, renderHook } from '@testing-library/react';
import { useFilters } from './useFilters';

describe('useFilters', () => {
  it('updates one filter key without mutating others', () => {
    const { result } = renderHook(() =>
      useFilters({ search: '', status: null as string | null, min: 0 }),
    );

    act(() => {
      result.current.updateFilter('search', 'q1');
    });

    expect(result.current.filters).toEqual({ search: 'q1', status: null, min: 0 });
  });

  it('detects active filters and can reset all', () => {
    const { result } = renderHook(() =>
      useFilters({ search: '', status: null as string | null, min: '' }),
    );

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.updateFilter('status', 'OPEN');
    });

    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters).toEqual({ search: '', status: null, min: '' });
    expect(result.current.hasActiveFilters).toBe(false);
  });
});
