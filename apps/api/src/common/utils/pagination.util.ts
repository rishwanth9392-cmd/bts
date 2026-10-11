export interface PaginationParams {
  page?: number | string | null;
  limit?: number | string | null;
  skip?: number | string | null;
  offset?: number | string | null;
}

export interface ClampedPagination {
  limit: number;
  skip: number;
  page: number;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  offset: number;
  meta: PaginatedMeta;
}

/**
 * Standardized pagination parsing and clamping.
 * - Upper clamp: limit capped at maxLimit (default 100)
 * - Lower bound & NaN safety: invalid/negative/zero limit falls back safely to defaultLimit (default 50)
 * - Offset calculation: (page - 1) * limit if explicit skip/offset not supplied
 */
export function clampPagination(
  params?: PaginationParams,
  defaultLimit = 50,
  maxLimit = 100,
): ClampedPagination {
  const rawLimit =
    params?.limit !== undefined && params?.limit !== null ? Number(params.limit) : NaN;

  let safeLimit: number;
  if (isNaN(rawLimit) || !isFinite(rawLimit) || rawLimit <= 0) {
    safeLimit = defaultLimit;
  } else {
    safeLimit = Math.max(1, Math.min(Math.floor(rawLimit), maxLimit));
  }

  const rawPage =
    params?.page !== undefined && params?.page !== null ? Number(params.page) : NaN;
  const pageNumber =
    isNaN(rawPage) || !isFinite(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);

  const rawSkipOrOffset =
    params?.skip !== undefined && params?.skip !== null
      ? Number(params.skip)
      : params?.offset !== undefined && params?.offset !== null
      ? Number(params.offset)
      : NaN;

  let safeSkip: number;
  if (!isNaN(rawSkipOrOffset) && isFinite(rawSkipOrOffset) && rawSkipOrOffset >= 0) {
    safeSkip = Math.floor(rawSkipOrOffset);
  } else {
    safeSkip = Math.max(0, (pageNumber - 1) * safeLimit);
  }

  return {
    limit: safeLimit,
    skip: safeSkip,
    page: pageNumber,
  };
}

/**
 * Wraps paginated records with standardized envelope metadata.
 * Backward-compatible with top-level total, page, limit, totalPages, offset properties.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  clamped: ClampedPagination,
): PaginatedResponse<T> {
  const safeTotal = Math.max(0, total);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / clamped.limit);

  return {
    data,
    total: safeTotal,
    page: clamped.page,
    limit: clamped.limit,
    totalPages,
    offset: clamped.skip,
    meta: {
      total: safeTotal,
      page: clamped.page,
      limit: clamped.limit,
      totalPages,
    },
  };
}
