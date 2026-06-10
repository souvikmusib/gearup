import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';

export function paginate(
  { page = 1, pageSize = DEFAULT_PAGE_SIZE }: { page?: number; pageSize?: number },
  { maxPageSize = MAX_PAGE_SIZE }: { maxPageSize?: number } = {},
) {
  const take = Math.min(Math.max(pageSize, 1), maxPageSize);
  const skip = (Math.max(page, 1) - 1) * take;
  return { skip, take };
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
