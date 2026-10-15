import { mockTweets } from "@/data/mock-tweets";
import { isQualified } from "@/lib/score";
import type { Category, TimeRange, TweetRecord } from "@/lib/types";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Supabase `tweets` 表的一行(snake_case)。 */
interface TweetRow {
  tweet_id: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  category: string | null;
  lang: string | null;
  content: string;
  posted_at: string;
  url: string;
  views: number | null;
  likes: number | null;
  retweets: number | null;
  bookmarks: number | null;
}

export function rowToRecord(row: TweetRow): TweetRecord {
  const postedAt = row.posted_at;
  return {
    id: row.tweet_id,
    author: row.author_name,
    handle: row.author_handle,
    avatar: row.author_avatar,
    category: (row.category ?? "AI实战") as Category,
    timeRange: rangeOf(postedAt),
    postedAt,
    content: row.content,
    url: row.url,
    lang: row.lang ?? "zh-cn",
    views: row.views ?? 0,
    likes: row.likes ?? 0,
    retweets: row.retweets ?? 0,
    bookmarks: row.bookmarks ?? 0,
  };
}

function rangeOf(iso: string): TimeRange {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours <= 24) return "today";
  if (hours <= 48) return "yesterday";
  return "week";
}

async function fetchFromSupabase(sinceISO: string): Promise<TweetRecord[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tweets`);
  url.searchParams.set("select", "*");
  url.searchParams.set("posted_at", `gte.${sinceISO}`);
  url.searchParams.set("order", "posted_at.desc");
  url.searchParams.set("limit", "500");

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY as string,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    // 榜单是每小时刷新的聚合数据,缓存 60s 足够,还能省 Supabase 额度
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }

  const rows = (await res.json()) as TweetRow[];
  return rows.map(rowToRecord).filter((tweet) => isQualified(tweet));
}

/**
 * 读取最近 7 天的推文。
 * 没配 Supabase 或请求失败时回落到演示数据 —— 保证本地 / 预览环境永远有东西看。
 */
export async function loadTweets(): Promise<{ items: TweetRecord[]; source: "supabase" | "mock" }> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();

  if (supabaseConfigured) {
    try {
      const items = await fetchFromSupabase(since);
      if (items.length > 0) return { items, source: "supabase" };
    } catch (error) {
      console.error("[tweets] Supabase 读取失败,回落到演示数据:", error);
    }
  }

  return { items: mockTweets(now).filter((tweet) => isQualified(tweet)), source: "mock" };
}
