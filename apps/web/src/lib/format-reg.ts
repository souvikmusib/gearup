/** Auto-formats Indian vehicle registration with dashes: WB-68-K-5489 */
export function formatRegNumber(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '';
  const parts: string[] = [];
  let i = 0;
  // State code: 1-2 letters
  const state = clean.slice(i).match(/^[A-Z]{1,2}/)?.[0] || '';
  if (state) { parts.push(state); i += state.length; }
  // District: 1-2 digits
  const dist = clean.slice(i).match(/^[0-9]{1,2}/)?.[0] || '';
  if (dist) { parts.push(dist); i += dist.length; }
  // Series: 1-3 letters (some have 3)
  const series = clean.slice(i).match(/^[A-Z]{1,3}/)?.[0] || '';
  if (series) { parts.push(series); i += series.length; }
  // Number: remaining digits (1-4)
  const num = clean.slice(i).match(/^[0-9]{1,4}/)?.[0] || '';
  if (num) { parts.push(num); i += num.length; }
  // Any overflow (non-standard formats) — just append
  if (i < clean.length) parts.push(clean.slice(i));
  return parts.filter(Boolean).join('-');
}

export function isValidRegNumber(value: string): boolean {
  return value.replace(/[^A-Z0-9]/gi, '').length >= 4;
}
