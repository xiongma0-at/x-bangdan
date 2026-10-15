import { rankCreators } from "@/lib/creators";
import { withinWindow } from "@/lib/score";
import { loadTweets } from "@/lib/tweets";
import { CATEGORIES, TIME_RANGES, type TimeRange } from "@/lib/types";

function parseRange(value: string | null): TimeRange {
  return TIME_RANGES.includes(value as TimeRange) ? (value as TimeRange) : "week";
}

/** 涨粉榜:把窗口内的上榜推文按作者聚合,按「涨粉潜力指数」排序 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // 涨粉榜默认看本周 —— 单日样本太小,看不出谁在稳定输出
  const range = parseRange(searchParams.get("range"));
  const category = searchParams.get("category") ?? "全部";
  const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 100);

  const now = new Date();
  const { items, source } = await loadTweets();
  const knownCategory = CATEGORIES.includes(category as (typeof CATEGORIES)[number]);

  const scoped = withinWindow(items, range, now).filter(
    (tweet) => category === "全部" || !knownCategory || tweet.category === category,
  );

  const creators = rankCreators(scoped, limit);

  return Response.json(
    {
      items: creators,
      meta: {
        source,
        timeRange: range,
        category,
        updatedAt: now.toISOString(),
        total: creators.length,
      },
    },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
