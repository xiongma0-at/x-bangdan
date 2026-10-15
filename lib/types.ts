export const CATEGORIES = [
  "全部",
  "AI实战",
  "X做号经验",
  "独立开发",
  "出海搞钱",
] as const;

export type Category = Exclude<(typeof CATEGORIES)[number], "全部">;

export const TIME_RANGES = ["today", "yesterday", "week"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export interface TweetMetrics {
  views: number;
  likes: number;
  retweets: number;
  bookmarks: number;
}

/** A tweet as stored in Supabase / returned by the crawler. */
export interface TweetRecord extends TweetMetrics {
  id: string;
  author: string;
  handle: string;
  avatar: string | null;
  category: Category;
  timeRange: TimeRange;
  postedAt: string; // ISO string, the real source of truth for time filtering
  content: string;
  url: string;
  lang: string;
}

/** A tweet plus everything computed by the ranking algorithm. */
export interface RankedTweet extends TweetRecord {
  /** 0–100 heat index, the number shown on the card badge. */
  score: number;
  /** Raw weighted engagement (likes*1 + rt*3 + bookmarks*5). */
  rawScore: number;
  /** rawScore per hour since posting — used by 本周飙升. */
  velocity: number;
  postedAtLabel: string;
  rank: number;
}

export interface TweetsResponse {
  items: RankedTweet[];
  meta: {
    source: "supabase" | "mock";
    timeRange: TimeRange;
    category: string;
    query: string;
    updatedAt: string;
    total: number;
  };
}
