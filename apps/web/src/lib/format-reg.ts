/** Auto-formats Indian vehicle registration - uppercases, no truncation */
export function formatRegNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9\-\/\s]/g, '');
}

export function isValidRegNumber(value: string): boolean {
  return value.length >= 4;
}
