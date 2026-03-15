export class PaginatedResponseDto<T> {
  data!: T[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}
