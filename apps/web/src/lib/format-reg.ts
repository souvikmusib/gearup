/** Auto-formats Indian vehicle registration: WB-26-AB-1234 */
export function formatRegNumber(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const parts: string[] = [];
  let i = 0;
  const state = clean.slice(i).match(/^[A-Z]{0,2}/)?.[0] || '';
  if (state) { parts.push(state); i += state.length; }
  const dist = clean.slice(i).match(/^[0-9]{0,2}/)?.[0] || '';
  if (dist) { parts.push(dist); i += dist.length; }
  const series = clean.slice(i).match(/^[A-Z]{0,2}/)?.[0] || '';
  if (series) { parts.push(series); i += series.length; }
  const num = clean.slice(i).match(/^[0-9]{0,4}/)?.[0] || '';
  if (num) { parts.push(num); i += num.length; }
  return parts.filter(Boolean).join('-');
}

export function isValidRegNumber(value: string): boolean {
  return /^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{1,4}$/.test(value);
}
