import { act, renderHook } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  it('delays propagation until delay expires', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('ab');

    vi.useRealTimers();
  });

  it('clears previous timer when value changes quickly', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 'one' },
    });

    rerender({ value: 'two' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'three' });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe('one');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('three');

    vi.useRealTimers();
  });
});
