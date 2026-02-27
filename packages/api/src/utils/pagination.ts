export interface PaginationParams {
  page: number;
  pageSize: number;
}

export function parsePagination(
  query: Record<string, unknown>,
): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(String(query.pageSize || '20'), 10)),
  );
  return { page, pageSize };
}

export function paginationMeta(total: number, params: PaginationParams) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

export function paginationOffset(params: PaginationParams): number {
  return (params.page - 1) * params.pageSize;
}
