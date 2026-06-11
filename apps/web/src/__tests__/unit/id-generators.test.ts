import { describe, it, expect, vi } from 'vitest';
import {
  generateJobCardNumber,
  generateInvoiceNumber,
  generateReferenceId,
  generateAppointmentRef,
  generateWorkerCode,
  generateAmcContractNumber,
  withIdCollisionRetry,
} from '../../lib/id-generators';

describe('id generators — shape', () => {
  it('job-card numbers are JC- + 12 alphanumerics', () => {
    expect(generateJobCardNumber()).toMatch(/^JC-[0-9A-Z]{12}$/);
  });
  it('invoice numbers are INV- + 12', () => {
    expect(generateInvoiceNumber()).toMatch(/^INV-[0-9A-Z]{12}$/);
  });
  it('reference ids match prefix + 12', () => {
    expect(generateReferenceId()).toMatch(/^[A-Z]+-[0-9A-Z]{12}$/);
  });
  it('appointment refs are APT- + 12', () => {
    expect(generateAppointmentRef()).toMatch(/^APT-[0-9A-Z]{12}$/);
  });
  it('worker codes are WRK- + 6', () => {
    expect(generateWorkerCode()).toMatch(/^WRK-[0-9A-Z]{6}$/);
  });
  it('amc contract numbers are AMC- + 12', () => {
    expect(generateAmcContractNumber()).toMatch(/^AMC-[0-9A-Z]{12}$/);
  });
  it('are unique across many calls', () => {
    const s = new Set(Array.from({ length: 500 }, generateInvoiceNumber));
    expect(s.size).toBe(500);
  });
});

describe('withIdCollisionRetry', () => {
  it('returns on first success without retrying', async () => {
    const fn = vi.fn(async (id: string) => `ok:${id}`);
    const r = await withIdCollisionRetry(() => 'A', fn, 'invoiceNumber');
    expect(r).toBe('ok:A');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on P2002 collision for the matching target then succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async (id: string) => {
      calls++;
      if (calls < 2) {
        const e: any = new Error('dup');
        e.code = 'P2002';
        e.meta = { target: ['invoiceNumber'] };
        throw e;
      }
      return `ok:${id}`;
    });
    const r = await withIdCollisionRetry(() => `id${calls}`, fn, 'invoiceNumber');
    expect(r).toMatch(/^ok:/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('re-throws non-collision errors immediately', async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error('other');
      e.code = 'P2003';
      throw e;
    });
    await expect(withIdCollisionRetry(() => 'A', fn, 'invoiceNumber')).rejects.toThrow('other');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-throws a P2002 on a DIFFERENT target (not our unique)', async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error('dup-other');
      e.code = 'P2002';
      e.meta = { target: ['sku'] };
      throw e;
    });
    await expect(withIdCollisionRetry(() => 'A', fn, 'invoiceNumber')).rejects.toThrow('dup-other');
  });

  it('gives up after the attempt budget and throws the last error', async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error('always-dup');
      e.code = 'P2002';
      e.meta = { target: 'invoiceNumber' };
      throw e;
    });
    await expect(withIdCollisionRetry(() => 'A', fn, 'invoiceNumber', 3)).rejects.toThrow('always-dup');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
