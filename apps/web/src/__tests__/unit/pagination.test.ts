import { describe, it, expect } from 'vitest';
import { paginate, paginationMeta } from '../../lib/pagination';
import { MAX_PAGE_SIZE } from '../../lib/constants';

describe('paginate', () => {
  it('computes skip/take for page 1', () => {
    expect(paginate({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('computes skip for later pages', () => {
    expect(paginate({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('clamps pageSize to MAX_PAGE_SIZE', () => {
    const { take } = paginate({ page: 1, pageSize: 100000 });
    expect(take).toBe(MAX_PAGE_SIZE);
  });

  it('floors pageSize at 1', () => {
    expect(paginate({ page: 1, pageSize: 0 }).take).toBe(1);
    expect(paginate({ page: 1, pageSize: -5 }).take).toBe(1);
  });

  it('floors page at 1 (no negative skip)', () => {
    expect(paginate({ page: 0, pageSize: 20 }).skip).toBe(0);
    expect(paginate({ page: -3, pageSize: 20 }).skip).toBe(0);
  });

  it('uses defaults when args omitted', () => {
    const r = paginate({});
    expect(r.take).toBeGreaterThan(0);
    expect(r.skip).toBe(0);
  });
});

describe('paginationMeta', () => {
  it('computes totalPages by ceiling', () => {
    expect(paginationMeta(45, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 45, totalPages: 3 });
  });

  it('handles exact division', () => {
    expect(paginationMeta(40, 2, 20).totalPages).toBe(2);
  });

  it('handles zero total', () => {
    expect(paginationMeta(0, 1, 20).totalPages).toBe(0);
  });
});
