/**
 * X榜单 · 抓取 → 清洗 → 打分 → 入库 管线(纯 JS,零依赖,Node 18+ / Vercel Cron 都能跑)
 *
 * 被两处复用:
 *   - scripts/fetch-x.mjs         本地 / 服务器 crontab 手动跑
 *   - app/api/cron/fetch-x/route.ts  Vercel Cron Jobs 定时打
 *
 * 打分公式的唯一权威在数据库(supabase/schema.sql 的 raw_score 生成列 +
 * heat_score() 函数),这里只做入榜门槛过滤,避免三处各写一套公式。
 */

/** 入榜门槛:过滤水帖 */
export const MIN_RAW_SCORE = 500;
export const MIN_BOOKMARKS = 50;

/** 分类关键词 --> 分类。命中越靠前的规则优先级越高。 */
const CATEGORY_RULES = [
  ["X做号经验", ["涨粉", "起号", "做号", "主页", "取关", "算法", "评论区", "转发率", "账号", "SOP"]],
  ["出海搞钱", ["出海", "美元", "$", "月入", "变现", "收款", "Stripe", "定价", "付费", "MRR", "独立站"]],
  ["独立开发", ["独立开发", "MVP", "技术栈", "部署", "Vercel", "Supabase", "全栈", "开源", "重构", "API"]],
  ["AI实战", ["AI", "GPT", "Claude", "Cursor", "Prompt", "提示词", "模型", "智能体", "Agent", "工作流"]],
];

/**
 * @param {string} text
 * @returns {'AI实战'|'X做号经验'|'独立开发'|'出海搞钱'}
 */
export function classifyCategory(text) {
  const haystack = (text || "").toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return /** @type {any} */ (category);
    }
  }
  return "AI实战";
}

/**
 * @typedef {object} RawTweet
 * @property {string} id
 * @property {string} author
 * @property {string} handle
 * @property {string|null} avatar
 * @property {string} content
 * @property {string} postedAt
 * @property {string} url
 * @property {number} views
 * @property {number} likes
 * @property {number} retweets
 * @property {number} bookmarks
 * @property {string} lang
 */

/** 加权互动分 = 赞×1 + 转×3 + 收藏×5 */
export function rawScore(tweet) {
  return (tweet.likes || 0) * 1 + (tweet.retweets || 0) * 3 + (tweet.bookmarks || 0) * 5;
}

export function isQualified(tweet) {
  return rawScore(tweet) >= MIN_RAW_SCORE && (tweet.bookmarks || 0) >= MIN_BOOKMARKS;
}

/** X 高级搜索语法:只要过去 24h 的简中原创、点赞 100+ 的推文,能省掉 90% 的抓取额度 */
export function buildSearchQuery({ sinceHours = 24 } = {}) {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString().slice(0, 10);
  return `lang:zh-cn min_faves:100 -filter:replies since:${since}`;
}

/**
 * Apify actor 的输入参数。
 * ⚠️ 不同 actor 字段名不一样,换 actor 时只改这个函数即可。
 * 默认用 apidojo/tweet-scraper。
 *
 * @param {{ searchQuery: string, maxItems: number }} options
 */
export function buildApifyInput({ searchQuery, maxItems }) {
  return {
    searchTerms: [searchQuery],
    maxItems,
    sort: "Top",
    tweetLanguage: "zh",
    queryType: "Latest",
  };
}

/** Apify 的返回字段各家不同,这里做一次防御性归一化。 */
function normalizeApifyItem(item) {
  const author = item.author || item.user || {};
  const handle = author.userName || author.screen_name || author.handle || "unknown";
  const id = String(item.id || item.id_str || item.tweetId || item.url || "");
  const text = item.text || item.full_text || item.content || "";
  const postedAt = item.createdAt || item.created_at || item.time || new Date().toISOString();
  const metrics = item.likeCount ?? item.favoriteCount ?? item.likes ?? 0;

  return {
    id,
    author: author.name || author.displayName || handle,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    avatar: author.profilePicture || author.profile_image_url_https || null,
    content: text,
    postedAt: new Date(postedAt).toISOString(),
    url: item.url || item.twitterUrl || `https://x.com/${handle.replace("@", "")}/status/${id}`,
    views: Number(item.viewCount ?? item.views ?? 0),
    likes: Number(metrics),
    retweets: Number(item.retweetCount ?? item.retweets ?? 0),
    bookmarks: Number(item.bookmarkCount ?? item.bookmarks ?? 0),
    lang: item.lang || "zh-cn",
  };
}

/**
 * 调 Apify 跑一次抓取。
 * @param {{ token: string, actorId: string, searchQuery: string, maxItems: number }} options
 * @returns {Promise<any[]>}
 */
export async function fetchFromApify({ token, actorId, searchQuery, maxItems }) {
  const actor = actorId.replace("/", "~");
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildApifyInput({ searchQuery, maxItems })),
  });

  if (!res.ok) {
    throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("Apify 返回的不是数组,检查 actor 是否需要 run-sync-get-dataset-items");
  return items.map(normalizeApifyItem);
}

/** 本地自测 / 没配 token 时用的假数据源,保证管线跑得通。 */
export async function fetchFromMock() {
  const now = Date.now();
  const seeds = [
    ["1", "AI 独立开发老王", "@laowang_ai", "AI实战", 3, "不会编程，我用 Cursor 在周末肝出一个 SEO 工具，收到第一笔 $49 付款", 128500, 1420, 385, 2190],
    ["2", "出海增长笔记", "@growth_hacker_cn", "X做号经验", 5, "研究了简中区 30 天涨粉最快的 20 个新号，这套起号 SOP 开源出来", 95200, 980, 260, 1850],
    ["3", "随便发发", "@nobody", "AI实战", 6, "今天天气真好", 120, 3, 0, 0],
  ];

  return seeds.map(([id, author, handle, category, hoursAgo, content, views, likes, retweets, bookmarks]) => ({
    id,
    author,
    handle,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
    category,
    content,
    postedAt: new Date(now - Number(hoursAgo) * 3_600_000).toISOString(),
    url: `https://x.com/${handle.replace("@", "")}/status/${id}`,
    views: Number(views),
    likes: Number(likes),
    retweets: Number(retweets),
    bookmarks: Number(bookmarks),
    lang: "zh-cn",
  }));
}

/**
 * 把推文 upsert 进 Supabase(用 REST,不用装 @supabase/supabase-js)。
 * @param {any[]} tweets
 * @param {{ url: string, key: string }} supabase
 */
export async function upsertTweets(tweets, { url, key }) {
  if (tweets.length === 0) return 0;

  const endpoint = new URL("/rest/v1/tweets", url);
  endpoint.searchParams.set("on_conflict", "tweet_id");

  const rows = tweets.map((tweet) => ({
    tweet_id: tweet.id,
    author_name: tweet.author,
    author_handle: tweet.handle,
    author_avatar: tweet.avatar,
    category: tweet.category,
    lang: tweet.lang,
    content: tweet.content,
    posted_at: tweet.postedAt,
    url: tweet.url,
    views: tweet.views,
    likes: tweet.likes,
    retweets: tweet.retweets,
    bookmarks: tweet.bookmarks,
    crawled_at: new Date().toISOString(),
  }));

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      // merge-duplicates = upsert:同一条推文更新互动数据,而不是报主键冲突
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) throw new Error(`Supabase upsert ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return rows.length;
}

async function logRun(supabase, payload) {
  if (!supabase) return;
  try {
    await fetch(new URL("/rest/v1/fetch_runs", supabase.url), {
      method: "POST",
      headers: {
        apikey: supabase.key,
        authorization: `Bearer ${supabase.key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("[ingest] 写 fetch_runs 日志失败(不影响主流程):", error);
  }
}

/**
 * 跑一次完整抓取。Vercel Cron 和本地 CLI 都调这个。
 *
 * @param {{
 *   source?: string,
 *   dryRun?: boolean,
 *   maxItems?: number,
 *   searchQuery?: string,
 *   env?: Record<string, string|undefined>,
 * }} [options]
 */
export async function runXIngest(options = {}) {
  const env = options.env ?? process.env;
  const source = options.source ?? env.INGEST_SOURCE ?? "apify";
  const dryRun = options.dryRun ?? false;
  const maxItems = Number(options.maxItems ?? env.X_MAX_ITEMS ?? 100);
  const searchQuery = options.searchQuery ?? env.X_SEARCH_QUERY ?? buildSearchQuery();

  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = !dryRun && supabaseUrl && supabaseKey ? { url: supabaseUrl, key: supabaseKey } : null;

  const startedAt = new Date().toISOString();
  /** @type {any[]} */
  let fetched = [];
  let upserted = 0;

  try {
    if (source === "mock") {
      fetched = await fetchFromMock();
    } else {
      if (!env.APIFY_TOKEN) throw new Error("缺少 APIFY_TOKEN(或把 INGEST_SOURCE 设为 mock 做本地自测)");
      fetched = await fetchFromApify({
        token: env.APIFY_TOKEN,
        actorId: env.APIFY_ACTOR_ID ?? "apidojo/tweet-scraper",
        searchQuery,
        maxItems,
      });
    }

    // 打分类 + 入榜门槛过滤;分类如果抓回来是空的,用关键词猜一个
    const qualified = fetched
      .filter((tweet) => tweet.content && tweet.id)
      .map((tweet) => ({ ...tweet, category: tweet.category || classifyCategory(tweet.content) }))
      .filter(isQualified);

    if (supabase) upserted = await upsertTweets(qualified, supabase);

    await logRun(supabase, {
      source,
      search_query: searchQuery,
      status: "success",
      fetched: fetched.length,
      qualified: qualified.length,
      upserted,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    return {
      ok: true,
      source,
      dryRun: !!dryRun || !supabase,
      searchQuery,
      fetched: fetched.length,
      qualified: qualified.length,
      upserted,
      top: qualified
        .map((tweet) => ({ handle: tweet.handle, rawScore: rawScore(tweet) }))
        .sort((a, b) => b.rawScore - a.rawScore)
        .slice(0, 5),
    };
  } catch (error) {
    await logRun(supabase, {
      source,
      search_query: searchQuery,
      status: "failed",
      fetched: fetched.length,
      error: String(/** @type {any} */ (error)?.message ?? error).slice(0, 1000),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    throw error;
  }
}
