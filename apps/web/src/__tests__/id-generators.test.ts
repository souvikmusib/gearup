import { describe, it, expect } from 'vitest';
import { generateReferenceId, generateJobCardNumber, generateInvoiceNumber, generateAppointmentRef, generateWorkerCode } from '../lib/id-generators';

describe('ID generators', () => {
  it('generateReferenceId has correct prefix and length', () => {
    const id = generateReferenceId();
    expect(id).toMatch(/^GU-[0-9A-Z]{8}$/);
  });

  it('generateJobCardNumber has correct prefix and length', () => {
    const id = generateJobCardNumber();
    expect(id).toMatch(/^JC-[0-9A-Z]{8}$/);
  });

  it('generateInvoiceNumber has correct prefix and length', () => {
    const id = generateInvoiceNumber();
    expect(id).toMatch(/^INV-[0-9A-Z]{8}$/);
  });

  it('generateAppointmentRef has correct prefix and length', () => {
    const id = generateAppointmentRef();
    expect(id).toMatch(/^APT-[0-9A-Z]{8}$/);
  });

  it('generateWorkerCode has correct prefix and length', () => {
    const id = generateWorkerCode();
    expect(id).toMatch(/^WRK-[0-9A-Z]{6}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateInvoiceNumber()));
    expect(ids.size).toBe(100);
  });
});
