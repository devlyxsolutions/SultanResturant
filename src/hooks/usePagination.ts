import { useState, useMemo, useEffect } from 'react';

export interface UsePaginationOptions<T> {
  data: T[];
  initialPage?: number;
  initialPageSize?: number;
}

export interface UsePaginationReturn<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  paginatedData: T[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  setPageSize: (size: number) => void;
}

export function usePagination<T>({
  data,
  initialPage = 1,
  initialPageSize = 10,
}: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset or clamp currentPage if totalPages shrinks
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedData = useMemo(() => {
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex]);

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);
  const firstPage = () => goToPage(1);
  const lastPage = () => goToPage(totalPages);

  const setPageSize = (newSize: number) => {
    if (newSize > 0) {
      setPageSizeState(newSize);
      setCurrentPage(1);
    }
  };

  return {
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    paginatedData,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setPageSize,
  };
}
