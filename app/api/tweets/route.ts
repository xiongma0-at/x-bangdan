import { loadTweets } from "@/lib/tweets";
import { rankTweets, withinWindow } from "@/lib/score";
import { CATEGORIES, TIME_RANGES, type TimeRange, type TweetsResponse } from "@/lib/types";

function parseRange(value: string | null): TimeRange {
  return TIME_RANGES.includes(value as TimeRange) ? (value as TimeRange) : "today";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));
  const category = searchParams.get("category") ?? "全部";
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);

  const now = new Date();
  const { items, source } = await loadTweets();

  const knownCategory = CATEGORIES.includes(category as (typeof CATEGORIES)[number]);
  const scoped = withinWindow(items, range, now).filter((tweet) => {
    const matchCategory = category === "全部" || !knownCategory || tweet.category === category;
    if (!matchCategory) return false;
    if (!query) return true;
    return (
      tweet.content.toLowerCase().includes(query) ||
      tweet.author.toLowerCase().includes(query) ||
      tweet.handle.toLowerCase().includes(query)
    );
  });

  const ranked = rankTweets(scoped, range, now).slice(0, limit);

  const body: TweetsResponse = {
    items: ranked,
    meta: {
      source,
      timeRange: range,
      category,
      query,
      updatedAt: now.toISOString(),
      total: ranked.length,
    },
  };

  return Response.json(body, {
    headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
