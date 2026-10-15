/** 128500 → 128.5K */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** 385 → 385 或 1.2K,用于点赞/转发 */
export function formatCount(value: number): string {
  return value >= 10_000 ? formatCompact(value) : value.toLocaleString("en-US");
}
