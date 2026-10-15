-- ============================================================
--  X榜单 · Supabase 建表脚本
--  用法:打开 Supabase 控制台 → SQL Editor → 新建查询 → 整体粘贴执行
-- ============================================================

-- 0. 中文关键词搜索需要的扩展
create extension if not exists pg_trgm;

-- 1. 推文主表 -------------------------------------------------
create table if not exists public.tweets (
  tweet_id        text primary key,                       -- X 的推文 ID
  author_name     text        not null,
  author_handle   text        not null,
  author_avatar   text,
  category        text        not null default 'AI实战'
                  check (category in ('AI实战', 'X做号经验', '独立开发', '出海搞钱')),
  lang            text        not null default 'zh-cn',
  content         text        not null,
  posted_at       timestamptz not null,                   -- 推文发布时间(排序/时间窗口都靠它)
  url             text        not null,
  views           integer     not null default 0,
  likes           integer     not null default 0,
  retweets        integer     not null default 0,
  bookmarks       integer     not null default 0,
  -- 爆款打分公式:赞×1 + 转×3 + 收藏×5(收藏=干货,转发=传播,权重最高)
  raw_score       integer generated always as (likes * 1 + retweets * 3 + bookmarks * 5) stored,
  crawled_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.tweets.raw_score is '加权互动分 = likes*1 + retweets*3 + bookmarks*5';

create index if not exists tweets_posted_at_idx  on public.tweets (posted_at desc);
create index if not exists tweets_raw_score_idx  on public.tweets (raw_score desc);
create index if not exists tweets_category_idx   on public.tweets (category, posted_at desc);
-- 中文内容的关键词搜索(可选,榜单量不大时用 ilike 也够)
create index if not exists tweets_content_trgm_idx on public.tweets using gin (content gin_trgm_ops);

-- 2. 每次抓取的运行日志(排障用) -----------------------------
create table if not exists public.fetch_runs (
  id          bigserial primary key,
  source      text        not null,                       -- apify | rapidapi | manual
  search_query text       not null,
  status      text        not null default 'running' check (status in ('running', 'success', 'failed')),
  fetched     integer     not null default 0,
  qualified   integer     not null default 0,
  upserted    integer     not null default 0,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- 3. updated_at 自动维护 --------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tweets_touch_updated_at on public.tweets;
create trigger tweets_touch_updated_at
  before update on public.tweets
  for each row execute function public.touch_updated_at();

-- 4. 热力值(对数压缩成 0–100,和前端 lib/score.ts 保持一致) --
create or replace function public.heat_score(raw integer, reference integer default 20000)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(raw, 0) <= 0 then 0
    else round(least(1.0, ln(1 + raw) / ln(1 + reference)) * 1000) / 10
  end;
$$;

-- 5. 榜单视图:默认最近 7 天,已按热力值排好 ---------------
create or replace view public.ranked_tweets as
select
  t.*,
  public.heat_score(t.raw_score) as score
from public.tweets t
where t.posted_at >= now() - interval '7 days'
order by score desc;

-- 6. 行级安全:匿名只能读,写入只能走 service_role(定时脚本用)
alter table public.tweets     enable row level security;
alter table public.fetch_runs enable row level security;

drop policy if exists "tweets are publicly readable" on public.tweets;
create policy "tweets are publicly readable"
  on public.tweets for select
  using (true);

drop policy if exists "fetch_runs are publicly readable" on public.fetch_runs;
create policy "fetch_runs are publicly readable"
  on public.fetch_runs for select
  using (true);
-- 注意:没有 insert/update/delete 策略 = anon key 改不了任何数据。
-- service_role key 会绕过 RLS,所以抓取脚本用 service_role。

-- 7.(可选)定时清理 30 天前的旧数据,避免表无限膨胀
--    在 Supabase 的 Database → Cron 里跑:
--    select cron.schedule('clean-old-tweets', '0 4 * * *',
--      $$delete from public.tweets where posted_at < now() - interval '30 days'$$);
