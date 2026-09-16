export function round(v: number | null | undefined, dp: number): number | null | undefined {
  if (v === null || v === undefined || Number.isNaN(v)) return v;
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}
