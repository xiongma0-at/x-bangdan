import { runXIngest } from "@/lib/x-pipeline.mjs";

/**
 * Vercel Cron Jobs 定时入口(vercel.json 里配成每小时跑一次)。
 *
 * Vercel 会在请求头里带上 `Authorization: Bearer $CRON_SECRET`,
 * 所以只有拿得到这个密钥的人(也就是 Vercel 自己)能触发抓取。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // 生产环境必须配 CRON_SECRET,否则任何人都能刷爆你的 Apify 额度
    return Response.json({ ok: false, error: "CRON_SECRET 未配置" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? undefined;

  try {
    const result = await runXIngest({
      source,
      maxItems: searchParams.get("maxItems") ? Number(searchParams.get("maxItems")) : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { ok: false, error: String((error as Error)?.message ?? error) },
      { status: 502 },
    );
  }
}
