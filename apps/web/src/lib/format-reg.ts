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

// Indian reg formats:
//   Standard: SS DD L(1-3) NNNN     e.g. WB68K5489, KL01CA1234, DL5SAB1234
//   BH-series: NN BH NNNN L(1-2)    e.g. 22BH1234AA
const STANDARD_REG = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/;
const BH_REG = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

export function isValidRegNumber(value: string): boolean {
  const clean = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (clean.length < 4) return false;
  return STANDARD_REG.test(clean) || BH_REG.test(clean);
}
