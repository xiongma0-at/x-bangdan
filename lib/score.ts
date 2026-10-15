import type { RankedTweet, TimeRange, TweetMetrics, TweetRecord } from "./types";

/**
 * 爆款打分公式(权重可按你的体感直接调):
 *   rawScore = Likes * 1 + Retweets * 3 + Bookmarks * 5
 * 收藏 = 干货程度,转发 = 传播度,所以权重最高。
 */
export const SCORE_WEIGHTS = {
  likes: 1,
  retweets: 3,
  bookmarks: 5,
} as const;

/**
 * 归一化参考分:rawScore 达到这个量级时热力值 ≈ 100。
 * 想收紧榜单门槛就调小它。
 */
export const REFERENCE_SCORE = 20000;

export function rawScore(metrics: Pick<TweetMetrics, "likes" | "retweets" | "bookmarks">): number {
  return (
    (metrics.likes ?? 0) * SCORE_WEIGHTS.likes +
    (metrics.retweets ?? 0) * SCORE_WEIGHTS.retweets +
    (metrics.bookmarks ?? 0) * SCORE_WEIGHTS.bookmarks
  );
}

/** 对数压缩成 0–100 的热力值,避免头部大号把榜单拉爆。 */
export function heatScore(raw: number, reference = REFERENCE_SCORE): number {
  if (raw <= 0) return 0;
  const ratio = Math.log1p(raw) / Math.log1p(reference);
  return Math.round(Math.min(1, ratio) * 1000) / 10;
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  const posted = new Date(iso).getTime();
  if (Number.isNaN(posted)) return 1;
  const hours = (now.getTime() - posted) / 3_600_000;
  return Math.max(hours, 1 / 6); // 最低按 10 分钟算,避免刚发的推文分母为 0
}

export function velocity(raw: number, iso: string, now: Date = new Date()): number {
  return Math.round((raw / hoursSince(iso, now)) * 10) / 10;
}

/**
 * 入榜门槛:过滤水帖。低于门槛的推文抓回来也不进榜单。
 */
export const MIN_BOOKMARKS = 50;
export const MIN_RAW_SCORE = 500;

export function isQualified(metrics: TweetMetrics): boolean {
  return rawScore(metrics) >= MIN_RAW_SCORE && metrics.bookmarks >= MIN_BOOKMARKS;
}

export function postedAtLabel(iso: string, now: Date = new Date()): string {
  const hours = hoursSince(iso, now);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}分钟前`;
  if (hours < 24) return `${Math.round(hours)}小时前`;
  return `${Math.round(hours / 24)}天前`;
}

/** today / yesterday / week 三个榜单的时间窗口(小时)。 */
export function windowHours(range: TimeRange): number {
  switch (range) {
    case "today":
      return 24;
    case "yesterday":
      return 48;
    case "week":
      return 24 * 7;
  }
}

/**
 * 榜单排序:
 * - 今日热榜 / 昨日爆款 → 按热力值
 * - 本周飙升           → 按单位时间增速(velocity),这才是"飙升"
 */
export function rankTweets(
  records: TweetRecord[],
  range: TimeRange,
  now: Date = new Date(),
): RankedTweet[] {
  const ranked = records.map((tweet) => {
    const raw = rawScore(tweet);
    return {
      ...tweet,
      rawScore: raw,
      score: heatScore(raw),
      velocity: velocity(raw, tweet.postedAt, now),
      postedAtLabel: postedAtLabel(tweet.postedAt, now),
      rank: 0,
    };
  });

  ranked.sort((a, b) => (range === "week" ? b.velocity - a.velocity : b.score - a.score));

  return ranked.map((tweet, index) => ({ ...tweet, rank: index + 1 }));
}

/** 有限时间窗口过滤,配合 rankTweets 使用。 */
export function withinWindow(
  records: TweetRecord[],
  range: TimeRange,
  now: Date = new Date(),
): TweetRecord[] {
  if (range === "week") return records;

  const maxHours = windowHours(range);
  const minHours = range === "yesterday" ? 24 : 0;

  return records.filter((tweet) => {
    const hours = hoursSince(tweet.postedAt, now);
    return hours <= maxHours && hours >= minHours;
  });
}
