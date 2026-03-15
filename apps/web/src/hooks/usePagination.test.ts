import { act, renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  it('starts with default values', () => {
    const { result } = renderHook(() => usePagination());

    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20);
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(0);
  });

  it('normalizes invalid page and limit', () => {
    const { result } = renderHook(() => usePagination(50));

    act(() => {
      result.current.setPage(-1);
      result.current.setLimit(-5);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20);
  });

  it('resets page when limit changes and updates metadata', () => {
    const { result } = renderHook(() => usePagination(10));

    act(() => {
      result.current.setPage(3);
      result.current.setLimit(15);
      result.current.setMeta(100, 7);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(15);
    expect(result.current.total).toBe(100);
    expect(result.current.totalPages).toBe(7);
  });

  it('resets to initial state', () => {
    const { result } = renderHook(() => usePagination(30));

    act(() => {
      result.current.setPage(4);
      result.current.setLimit(15);
      result.current.setMeta(40, 3);
      result.current.reset();
    });

    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(30);
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(0);
  });
});
