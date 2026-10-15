/* eslint-disable @next/next/no-img-element -- 头像来自 DiceBear(外部 SVG),用 next/image 需要开 dangerouslyAllowSVG,这里刻意用原生 img */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Flame,
  TrendingUp,
  Bookmark,
  Repeat2,
  Heart,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Search,
  Sparkles,
  Gift,
  RefreshCw,
  Trophy,
} from "lucide-react";

import { mockTweets } from "@/data/mock-tweets";
import { formatCompact, formatCount } from "@/lib/format";
import { rankTweets, withinWindow } from "@/lib/score";
import { CATEGORIES, type RankedTweet, type TimeRange, type TweetsResponse } from "@/lib/types";

const TIME_TABS: { id: TimeRange; label: string; hint: string }[] = [
  { id: "today", label: "今日热榜", hint: "过去 24 小时" },
  { id: "yesterday", label: "昨日爆款", hint: "24–48 小时前" },
  { id: "week", label: "本周飙升", hint: "按增速排序" },
];

/**
 * GitHub Pages 那种纯静态托管没有后端,构建时会把这个变量内联进来,
 * 页面直接用本地演示数据,不再去打 /api/tweets(Vercel 上是 0,走的正常接口)。
 */
const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

/** 首屏用本地演示数据直接渲染,不转圈;随后再拉 /api/tweets 换成实时数据。 */
function buildFallback(range: TimeRange, category: string, query: string): RankedTweet[] {
  const now = new Date();
  const q = query.trim().toLowerCase();
  const scoped = withinWindow(mockTweets(now), range, now).filter(
    (tweet) =>
      (category === "全部" || tweet.category === category) &&
      (!q ||
        tweet.content.toLowerCase().includes(q) ||
        tweet.author.toLowerCase().includes(q) ||
        tweet.handle.toLowerCase().includes(q)),
  );
  return rankTweets(scoped, range, now);
}

/** 首屏骨架:预渲染阶段不能读 new Date(),所以真实时间只在客户端挂载后才算 */
function SkeletonCard() {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-zinc-800" />
          <div className="h-2.5 w-20 rounded bg-zinc-800/70" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-zinc-800/70" />
        <div className="h-3 w-4/5 rounded bg-zinc-800/70" />
      </div>
    </div>
  );
}

export default function XBangDanPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("全部");
  const [timeFilter, setTimeFilter] = useState<TimeRange>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tweets, setTweets] = useState<RankedTweet[] | null>(null);
  const [source, setSource] = useState<TweetsResponse["meta"]["source"]>("mock");
  const [refreshing, setRefreshing] = useState(!STATIC_DEMO);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // 拉取榜单(静态演示站直接算本地数据;正常部署 200ms 防抖打接口)
  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (STATIC_DEMO) {
        setTweets(buildFallback(timeFilter, selectedCategory, searchQuery));
        setSource("mock");
        setUpdatedAt(new Date().toISOString());
        return;
      }

      setRefreshing(true);
      const params = new URLSearchParams({
        range: timeFilter,
        category: selectedCategory,
        q: searchQuery,
      });

      try {
        const res = await fetch(`/api/tweets?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TweetsResponse;
        setTweets(data.items);
        setSource(data.meta.source);
        setUpdatedAt(data.meta.updatedAt);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        // 接口挂了也要有内容:退回本地演示数据
        setTweets(buildFallback(timeFilter, selectedCategory, searchQuery));
        setSource("mock");
        setUpdatedAt(new Date().toISOString());
      } finally {
        setRefreshing(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [timeFilter, selectedCategory, searchQuery]);

  const activeTab = useMemo(
    () => TIME_TABS.find((tab) => tab.id === timeFilter) ?? TIME_TABS[0],
    [timeFilter],
  );

  const resetFilters = useCallback(() => {
    setSelectedCategory("全部");
    setSearchQuery("");
  }, []);

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 非 https / 无剪贴板权限时的兜底
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 font-sans selection:bg-blue-500/30">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0a0a0c]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-white">X榜单</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Beta
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block truncate">
                简中做号者每天看的爆款榜 · 每小时自动更新
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/creators"
              className="hidden sm:flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-300 hover:bg-violet-500/20 transition-colors"
              title="按作者聚合的涨粉榜"
            >
              <Trophy className="w-3.5 h-3.5" />
              涨粉榜
            </Link>

            {/* 时间维度切换 */}
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs shrink-0">
              {TIME_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTimeFilter(tab.id)}
                  title={tab.hint}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    timeFilter === tab.id
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 主体内容区 */}
      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左侧:榜单主列表 (8 列) */}
        <div className="lg:col-span-8 space-y-6">
          {/* 分类与搜索栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === category
                      ? "bg-white text-black font-semibold"
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索关键词或博主..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* 榜单状态条 */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                {activeTab.label} · {activeTab.hint}
              </span>
              <span>
                共 {tweets?.length ?? 0} 条
                {source === "mock" ? " · 演示数据" : " · 实时数据(Supabase)"}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
              {updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString("zh-CN")}` : "加载中…"}
            </span>
          </div>

          {/* 爆款推文卡片列表 */}
          <div className="space-y-4">
            {tweets === null && (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}

            {tweets?.length === 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-10 text-center">
                <p className="text-sm text-zinc-400">这个筛选条件下暂时没有上榜推文</p>
                <button
                  onClick={resetFilters}
                  className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  重置筛选
                </button>
              </div>
            )}

            {tweets?.map((tweet) => (
              <article
                key={tweet.id}
                className="group relative bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  {/* 排名序号 */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                      tweet.rank === 1
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : tweet.rank === 2
                          ? "bg-zinc-400/20 text-zinc-300 border border-zinc-400/30"
                          : tweet.rank === 3
                            ? "bg-amber-700/20 text-amber-500 border border-amber-700/30"
                            : "bg-zinc-800/60 text-zinc-500"
                    }`}
                  >
                    {tweet.rank}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 作者信息与爆款指数 */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2.5 truncate">
                        <img
                          src={
                            tweet.avatar ??
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tweet.handle)}`
                          }
                          alt={tweet.author}
                          loading="lazy"
                          className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-zinc-100 truncate">
                              {tweet.author}
                            </span>
                            <span className="text-xs text-zinc-500">{tweet.handle}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <span>{tweet.postedAtLabel}</span>
                            <span>·</span>
                            <span className="text-blue-400/90 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              {tweet.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 爆款热力值 */}
                      <div
                        className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full shrink-0"
                        title={`热力值 ${tweet.score} · 加权互动分 ${tweet.rawScore.toLocaleString("en-US")} · 增速 ${tweet.velocity}/小时`}
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-xs font-bold text-orange-400">{tweet.score}</span>
                        {timeFilter === "week" && (
                          <span className="text-[10px] text-orange-300/80">+{tweet.velocity}/h</span>
                        )}
                      </div>
                    </div>

                    {/* 推文正文 */}
                    <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line mb-4">
                      {tweet.content}
                    </p>

                    {/* 底部数据指标与操作按钮 */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-800/60 text-xs text-zinc-400">
                      <div className="flex items-center gap-5">
                        <span className="flex items-center gap-1.5 hover:text-zinc-200" title="浏览量">
                          <Eye className="w-3.5 h-3.5 text-zinc-500" />
                          {formatCompact(tweet.views)}
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-rose-400" title="点赞">
                          <Heart className="w-3.5 h-3.5 text-rose-500/70" />
                          {formatCount(tweet.likes)}
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-emerald-400" title="转发">
                          <Repeat2 className="w-3.5 h-3.5 text-emerald-500/70" />
                          {formatCount(tweet.retweets)}
                        </span>
                        <span
                          className="flex items-center gap-1.5 text-amber-400/90 font-medium"
                          title="书签收藏 (核心爆款指标)"
                        >
                          <Bookmark className="w-3.5 h-3.5 fill-amber-400/20" />
                          {formatCount(tweet.bookmarks)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(tweet.id, tweet.content)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                        >
                          {copiedId === tweet.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>复制文案</span>
                            </>
                          )}
                        </button>
                        <a
                          href={tweet.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 transition-colors"
                        >
                          <span>原推</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 右侧:站长个人品牌 & 私域转化侧边栏 (4 列) */}
        <div className="lg:col-span-4">
          <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:sticky lg:top-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-0.5">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Creator"
                  alt="站长头像"
                  className="w-full h-full rounded-full bg-zinc-900"
                />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">关于站长</h3>
                <p className="text-xs text-blue-400">AI 独立开发者 / X 增长实战派</p>
              </div>
            </div>

            {/* 黄金4行简介展示区 */}
            <div className="space-y-2.5 text-xs text-zinc-300 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80 mb-5 leading-relaxed">
              <p>🚀 不会编程，用 AI 做出自己的产品线</p>
              <p>💡 分享 AI 工具实战和 X 做号经验</p>
              <p>
                📊 <strong>X榜单</strong>：简中做号者每天看的爆款榜
              </p>
              <p className="text-amber-400 font-medium flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 shrink-0" />
                新手私信送一份【X起号SOP与爆款模板】
              </p>
            </div>

            {/* 评分算法说明 */}
            <div className="space-y-2 mb-6">
              <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                榜单收录与排序逻辑
              </h4>
              <p className="text-xs text-zinc-500 leading-relaxed">
                每小时自动抓取简中区高活跃创作者推文，重点提升
                <strong className="text-zinc-300">「书签收藏率」</strong>与
                <strong className="text-zinc-300">「有效转发」</strong>
                权重，过滤水帖，帮你 5 分钟捕捉每日最佳选题灵感。
              </p>
              <p className="text-[11px] text-zinc-600 font-mono pt-1">互动分 = 赞×1 + 转×3 + 收藏×5</p>
            </div>

            {/* CTA 行动按钮 */}
            <a
              href="https://x.com"
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-white/5"
            >
              <span>关注我的 X 领起号资料</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
