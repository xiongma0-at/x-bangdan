import type { Category, TweetRecord } from "./types";
import { heatScore, rawScore } from "./score";

/**
 * 作者聚合(涨粉榜)的一条记录。
 * 思路:做号的人真正想知道的是「谁在稳定出爆款」,而不是单条推文多火,
 * 所以指数由三部分构成 —— 互动总量、稳定输出、收藏密度。
 */
export interface CreatorStat {
  handle: string;
  author: string;
  avatar: string | null;
  category: Category;
  tweetCount: number;
  totalRaw: number;
  totalBookmarks: number;
  totalViews: number;
  avgBookmarks: number;
  /** 该作者本周期内互动分最高的推文,作为「代表爆款」 */
  bestTweet: TweetRecord;
  /** 0–100 涨粉潜力指数 */
  index: number;
  rank: number;
}

export const CREATOR_WEIGHTS = {
  /** 互动总量:最重要的信号 */
  engagement: 0.7,
  /** 稳定输出:上榜推文越多,说明不是一次运气 */
  consistency: 0.2,
  /** 收藏密度:平均收藏越高,内容越硬 */
  density: 0.1,
} as const;

/** 上榜 5 条就算"稳定输出"满分 */
export const CONSISTENCY_TARGET = 5;
/** 平均收藏 2000 就算"高密度"满分 */
export const DENSITY_TARGET = 2000;

export function creatorIndex(stats: {
  totalRaw: number;
  tweetCount: number;
  avgBookmarks: number;
}): number {
  const engagement = heatScore(stats.totalRaw);
  const consistency = Math.min(1, stats.tweetCount / CONSISTENCY_TARGET) * 100;
  const density = Math.min(1, stats.avgBookmarks / DENSITY_TARGET) * 100;

  const index =
    engagement * CREATOR_WEIGHTS.engagement +
    consistency * CREATOR_WEIGHTS.consistency +
    density * CREATOR_WEIGHTS.density;

  return Math.round(index * 10) / 10;
}

/** 取出现次数最多的分类作为该作者的标签 */
function dominantCategory(tweets: TweetRecord[]): Category {
  const tally = new Map<Category, number>();
  for (const tweet of tweets) {
    tally.set(tweet.category, (tally.get(tweet.category) ?? 0) + 1);
  }
  let best: Category = tweets[0].category;
  let bestCount = 0;
  for (const [category, count] of tally) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

export function rankCreators(records: TweetRecord[], limit = 20): CreatorStat[] {
  const grouped = new Map<string, TweetRecord[]>();

  for (const tweet of records) {
    const key = tweet.handle.toLowerCase();
    const bucket = grouped.get(key);
    if (bucket) bucket.push(tweet);
    else grouped.set(key, [tweet]);
  }

  const stats: Omit<CreatorStat, "rank">[] = [];

  for (const tweets of grouped.values()) {
    const totalRaw = tweets.reduce((sum, tweet) => sum + rawScore(tweet), 0);
    const totalBookmarks = tweets.reduce((sum, tweet) => sum + tweet.bookmarks, 0);
    const totalViews = tweets.reduce((sum, tweet) => sum + tweet.views, 0);
    const avgBookmarks = Math.round(totalBookmarks / tweets.length);
    const bestTweet = tweets.reduce((best, tweet) =>
      rawScore(tweet) > rawScore(best) ? tweet : best,
    );

    stats.push({
      handle: tweets[0].handle,
      author: tweets[0].author,
      avatar: tweets[0].avatar,
      category: dominantCategory(tweets),
      tweetCount: tweets.length,
      totalRaw,
      totalBookmarks,
      totalViews,
      avgBookmarks,
      bestTweet,
      index: creatorIndex({ totalRaw, tweetCount: tweets.length, avgBookmarks }),
    });
  }

  stats.sort((a, b) => b.index - a.index || b.totalRaw - a.totalRaw);

  return stats.slice(0, limit).map((stat, position) => ({ ...stat, rank: position + 1 }));
}
