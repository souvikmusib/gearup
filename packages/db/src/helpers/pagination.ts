import { PrismaClient } from '@prisma/client';

type PaginationArgs = { page?: number; pageSize?: number };

export function paginate({ page = 1, pageSize = 20 }: PaginationArgs) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  return { skip, take };
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
