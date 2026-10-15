# X榜单 · 简中爆款榜

简中做号者每天看的 X 爆款榜：每小时抓取简中区高互动推文，按「收藏 > 转发 > 点赞」加权排序，
一屏看完今日最佳选题灵感。前端 Next.js 16 + Tailwind v4，数据 Supabase，抓取 Apify。

![X榜单页面](preview.png)

## 快速开始(本地 1 分钟)

```bash
npm install
npm run dev          # http://localhost:3000
```

**不需要任何密钥就能跑**：页面挂载后从 `/api/tweets` 拉数据，没配 Supabase 时自动回落到
`data/mock-tweets.ts` 里的演示数据(时间戳按"当前时间往前推 N 小时"动态生成，永远看着是新鲜的)。

```bash
npm run build && npm start   # 生产模式
```

## 结构一览

```
app/
  page.tsx                  # 榜单页面(客户端组件:筛选/搜索/复制)
  api/tweets/route.ts       # 榜单数据接口,支持 ?range= &category= &q= &limit=
  api/cron/fetch-x/route.ts # Vercel Cron 定时抓取入口(CRON_SECRET 鉴权)
lib/
  score.ts                  # 打分与排序(页面上的分数都从这里算)
  x-pipeline.mjs            # 抓取 → 清洗 → 打分类 → 过门槛 → 入库(零依赖)
  types.ts / format.ts / tweets.ts
data/mock-tweets.ts         # 演示数据(数据库为空时兜底)
supabase/schema.sql         # 建表脚本:推文表 + 运行日志 + 榜单视图 + RLS
scripts/fetch-x.mjs         # 本地 / crontab 抓取脚本
vercel.json                 # Cron:每小时 05 分触发
.github/workflows/hourly-ingest.yml  # 免费替代方案(Vercel Hobby 的 Cron 只能每天一次)
```

## 爆款算法

```
rawScore = 点赞 ×1 + 转发 ×3 + 收藏 ×5                        # 收藏=干货程度,转发=传播度
score    = round(ln(1 + rawScore) / ln(1 + 20000) × 100, 1)   # 对数压缩成 0–100 热力值
```

- **入榜门槛**：`rawScore ≥ 500` 且 `bookmarks ≥ 50`，抓回来先过一遍，水帖不进榜。
- **时间窗口**：今日热榜 = 近 24h；昨日爆款 = 24–48h；**本周飙升 = 按 `rawScore / 发布小时数` 排序**，
  所以刚发几小时就爆的推文会排在大号老推文前面。
- **想调权重**：前端改 `lib/score.ts` 的 `SCORE_WEIGHTS` / `REFERENCE_SCORE`；
  数据库侧同步改 `supabase/schema.sql` 里 `raw_score` 生成列和 `heat_score()`。

## 接真实数据(3 步)

1. **建表**：Supabase 控制台 → SQL Editor → 粘贴执行 `supabase/schema.sql`。
2. **配环境变量**：复制 `.env.example` 为 `.env.local`，填 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、
   `APIFY_TOKEN`(Vercel 上在 Project → Settings → Environment Variables 里填)。
3. **抓一次**：

```bash
npm run fetch:x:dry     # 假数据跑通链路,不写库;先确认 fetched/qualified 统计正常
npm run fetch:x         # 用 Apify 真抓并写进 Supabase
```

想只验证不想写库：`node scripts/fetch-x.mjs --dry-run`，会打印 Top5 加权分。

### 搜索语句(省 API 额度的关键)

```
lang:zh-cn min_faves:100 -filter:replies since:2026-10-14
```

`lang:zh-cn` 只留简中、`min_faves:100` 先过滤掉 99% 普通推文、`-filter:replies` 只留原创。
脚本按当天日期自动拼 `since:`，也可以用 `X_SEARCH_QUERY` 或 `--query=` 覆盖。

### 定时任务

- **Vercel Pro**：`vercel.json` 已配好每小时跑 `/api/cron/fetch-x`，在环境变量里加 `CRON_SECRET`
  (Vercel 会自动用 `Authorization: Bearer $CRON_SECRET` 调你的接口)。
- **Vercel Hobby(免费)**：Cron 只允许每天一次，用仓库自带的 GitHub Actions 每小时打一次接口
  (配 `SITE_URL` 和 `CRON_SECRET` 两个 Secret)。
- **自己的服务器**：`5 * * * * cd /path/to/x-bangdan && node scripts/fetch-x.mjs >> /var/log/x-bangdan.log 2>&1`

## 部署到 Vercel

```bash
git init && git add -A && git commit -m "feat: X榜单"
# 推到 GitHub 后在 Vercel 导入该仓库,填好环境变量,Deploy
```

最后在 Vercel → Settings → Domains 绑定域名，按提示配 DNS。

## 换抓取数据源

不想用 Apify？在 `lib/x-pipeline.mjs` 里加一个 `fetchFromXxx()`(RapidAPI 的 `Twitter API45`，
或自建 `twikit` / `Rettiwt-API` 账号池)，然后在 `runXIngest()` 的 `source` 分支里接上即可——
打分、过滤、入库、日志都不用动。换 Apify actor 时只改 `buildApifyInput()` 里的字段名。

## 安全

- anon key 走 RLS 只能 SELECT；写入只有 `service_role` 能做，**带 `SUPABASE_SERVICE_ROLE_KEY`
  的行千万别加 `NEXT_PUBLIC_` 前缀**。
- `/api/cron/fetch-x` 生产环境强制校验 `CRON_SECRET`：没配返回 500，密钥不对返回 401，
  防止别人刷爆你的 Apify 额度。
