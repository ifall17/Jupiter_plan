import { useMemo, useState } from 'react';

export function useFilters<T extends Record<string, unknown>>(initialFilters: T) {
  const [filters, setFilters] = useState<T>(initialFilters);

  const updateFilter = <K extends keyof T>(key: K, value: T[K]): void => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const resetFilters = (): void => {
    setFilters(initialFilters);
  };

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => value !== null && value !== ''),
    [filters],
  );

  return { filters, updateFilter, resetFilters, hasActiveFilters };
}
