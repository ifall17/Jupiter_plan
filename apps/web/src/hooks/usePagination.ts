import { useState } from 'react';

export interface PaginationState {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setMeta: (total: number, totalPages: number) => void;
  reset: () => void;
}

const DEFAULT_PAGE_LIMIT = 20;

export function usePagination(initialLimit = DEFAULT_PAGE_LIMIT): PaginationState {
  const [page, setPageState] = useState<number>(1);
  const [limit, setLimitState] = useState<number>(initialLimit);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  const setPage = (nextPage: number): void => {
    setPageState(nextPage > 0 ? nextPage : 1);
  };

  const setLimit = (nextLimit: number): void => {
    setLimitState(nextLimit > 0 ? nextLimit : DEFAULT_PAGE_LIMIT);
    setPageState(1);
  };

  const setMeta = (nextTotal: number, nextTotalPages: number): void => {
    setTotal(nextTotal);
    setTotalPages(nextTotalPages);
  };

  const reset = (): void => {
    setPageState(1);
    setLimitState(initialLimit);
    setTotal(0);
    setTotalPages(0);
  };

  return {
    page,
    limit,
    totalPages,
    total,
    setPage,
    setLimit,
    setMeta,
    reset,
  };
}
