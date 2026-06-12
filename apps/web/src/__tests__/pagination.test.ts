import { describe, it, expect } from 'vitest';
import { paginate, paginationMeta } from '../lib/pagination';

describe('paginate', () => {
  it('returns default skip=0 take=20', () => {
    expect(paginate({})).toEqual({ skip: 0, take: 20 });
  });

  it('calculates correct skip for page 3', () => {
    expect(paginate({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('clamps pageSize to minimum 1', () => {
    expect(paginate({ page: 1, pageSize: 0 })).toEqual({ skip: 0, take: 1 });
    expect(paginate({ page: 1, pageSize: -5 })).toEqual({ skip: 0, take: 1 });
  });

  it('clamps pageSize to maximum 500', () => {
    expect(paginate({ page: 1, pageSize: 1000 })).toEqual({ skip: 0, take: 500 });
  });

  it('clamps page to minimum 1', () => {
    expect(paginate({ page: 0, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(paginate({ page: -1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
  });
});

describe('paginationMeta', () => {
  it('calculates totalPages correctly', () => {
    expect(paginationMeta(100, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 100, totalPages: 5 });
  });

  it('rounds up totalPages for partial pages', () => {
    expect(paginationMeta(21, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
  });

  it('handles zero total', () => {
    expect(paginationMeta(0, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('handles single item', () => {
    expect(paginationMeta(1, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });
});
