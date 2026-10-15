/* eslint-disable @next/next/no-img-element -- 头像来自 DiceBear(外部 SVG),刻意用原生 img */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  Flame,
  Info,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { mockTweets } from "@/data/mock-tweets";
import { rankCreators, type CreatorStat } from "@/lib/creators";
import { formatCompact, formatCount } from "@/lib/format";
import { withinWindow } from "@/lib/score";
import { CATEGORIES, type TimeRange } from "@/lib/types";

const TIME_TABS: { id: TimeRange; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "yesterday", label: "昨日" },
  { id: "week", label: "本周" },
];

const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

interface CreatorsResponse {
  items: CreatorStat[];
  meta: { source: "supabase" | "mock"; updatedAt: string; total: number };
}

function buildFallback(range: TimeRange, category: string, query: string): CreatorStat[] {
  const now = new Date();
  const q = query.trim().toLowerCase();
  const scoped = withinWindow(mockTweets(now), range, now).filter(
    (tweet) => category === "全部" || tweet.category === category,
  );
  const creators = rankCreators(scoped, 50);
  if (!q) return creators;
  return creators.filter(
    (creator) =>
      creator.author.toLowerCase().includes(q) ||
      creator.handle.toLowerCase().includes(q) ||
      creator.bestTweet.content.toLowerCase().includes(q),
  );
}

export default function CreatorsPage() {
  const [timeFilter, setTimeFilter] = useState<TimeRange>("week");
  const [selectedCategory, setSelectedCategory] = useState<string>("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [creators, setCreators] = useState<CreatorStat[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [source, setSource] = useState<"supabase" | "mock">("mock");
  const [refreshing, setRefreshing] = useState(!STATIC_DEMO);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (STATIC_DEMO) {
        setCreators(buildFallback(timeFilter, selectedCategory, searchQuery));
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
        const res = await fetch(`/api/creators?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CreatorsResponse;
        const q = searchQuery.trim().toLowerCase();
        setCreators(
          q
            ? data.items.filter(
                (creator) =>
                  creator.author.toLowerCase().includes(q) ||
                  creator.handle.toLowerCase().includes(q) ||
                  creator.bestTweet.content.toLowerCase().includes(q),
              )
            : data.items,
        );
        setSource(data.meta.source);
        setUpdatedAt(data.meta.updatedAt);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setCreators(buildFallback(timeFilter, selectedCategory, searchQuery));
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

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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

  const totalTweets = useMemo(
    () => (creators ?? []).reduce((sum, creator) => sum + creator.tweetCount, 0),
    [creators],
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 font-sans selection:bg-blue-500/30">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0a0a0c]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20"
              title="回到爆款榜"
            >
              <Flame className="w-5 h-5 text-white" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-white">X涨粉榜</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  谁在稳定出爆款
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block truncate">
                按作者聚合上榜推文 · 指数 = 互动量 70% + 稳定输出 20% + 收藏密度 10%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/"
              className="hidden sm:flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              爆款榜
            </Link>
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
              {TIME_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTimeFilter(tab.id)}
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

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
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
                placeholder="搜博主或代表推文..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                {TIME_TABS.find((tab) => tab.id === timeFilter)?.label}窗口
              </span>
              <span>
                {creators?.length ?? 0} 位作者 · 聚合 {totalTweets} 条上榜推文
                {source === "mock" ? " · 演示数据" : " · 实时数据(Supabase)"}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin text-violet-400" : ""}`} />
              {updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString("zh-CN")}` : "加载中…"}
            </span>
          </div>

          <div className="space-y-4">
            {creators === null && (
              <>
                {[0, 1, 2].map((key) => (
                  <div
                    key={key}
                    className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 animate-pulse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800" />
                      <div className="space-y-2">
                        <div className="h-3 w-36 rounded bg-zinc-800" />
                        <div className="h-2.5 w-24 rounded bg-zinc-800/70" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {creators?.length === 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-10 text-center">
                <p className="text-sm text-zinc-400">这个筛选条件下没有作者上榜</p>
                <button
                  onClick={() => {
                    setSelectedCategory("全部");
                    setSearchQuery("");
                  }}
                  className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  重置筛选
                </button>
              </div>
            )}

            {creators?.map((creator) => (
              <article
                key={creator.handle}
                className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                      creator.rank === 1
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : creator.rank === 2
                          ? "bg-zinc-400/20 text-zinc-300 border border-zinc-400/30"
                          : creator.rank === 3
                            ? "bg-amber-700/20 text-amber-500 border border-amber-700/30"
                            : "bg-zinc-800/60 text-zinc-500"
                    }`}
                  >
                    {creator.rank}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 truncate">
                        <img
                          src={
                            creator.avatar ??
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(creator.handle)}`
                          }
                          alt={creator.author}
                          loading="lazy"
                          className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            {creator.rank === 1 && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            <span className="font-semibold text-sm text-zinc-100 truncate">
                              {creator.author}
                            </span>
                            <span className="text-xs text-zinc-500">{creator.handle}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <span className="text-blue-400/90 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              {creator.category}
                            </span>
                            <span>上榜 {creator.tweetCount} 条</span>
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/25 px-2.5 py-1 rounded-full shrink-0"
                        title={`涨粉潜力指数 ${creator.index}(互动量 70% + 稳定输出 20% + 收藏密度 10%)`}
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-violet-300" />
                        <span className="text-xs font-bold text-violet-300">{creator.index}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div className="bg-zinc-950/50 border border-zinc-800/70 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-zinc-500 mb-0.5">总互动分</div>
                        <div className="text-sm font-semibold text-zinc-200">
                          {creator.totalRaw.toLocaleString("en-US")}
                        </div>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800/70 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-zinc-500 mb-0.5">平均收藏</div>
                        <div className="text-sm font-semibold text-amber-400/90">
                          {formatCount(creator.avgBookmarks)}
                        </div>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800/70 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-zinc-500 mb-0.5">总浏览</div>
                        <div className="text-sm font-semibold text-zinc-200">
                          {formatCompact(creator.totalViews)}
                        </div>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800/70 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-zinc-500 mb-0.5">收藏总数</div>
                        <div className="text-sm font-semibold text-zinc-200">
                          {formatCount(creator.totalBookmarks)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/60 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        代表爆款
                        <span className="text-zinc-600">
                          · {formatCount(creator.bestTweet.likes)} 赞 /{" "}
                          {formatCount(creator.bestTweet.retweets)} 转 /{" "}
                          {formatCount(creator.bestTweet.bookmarks)} 收藏
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 mb-2">
                        {creator.bestTweet.content}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(creator.handle, creator.bestTweet.content)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                        >
                          {copiedId === creator.handle ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制文案</span>
                            </>
                          )}
                        </button>
                        <a
                          href={creator.bestTweet.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 text-xs transition-colors"
                        >
                          <span>原推</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="flex items-center gap-1 text-[10px] text-zinc-500 ml-auto">
                          <Eye className="w-3 h-3" />
                          {formatCompact(creator.bestTweet.views)}
                          <Bookmark className="w-3 h-3 ml-2 fill-amber-400/20 text-amber-400/80" />
                          {formatCount(creator.bestTweet.bookmarks)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 右侧:算法说明 */}
        <div className="lg:col-span-4">
          <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:sticky lg:top-24">
            <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
              <Info className="w-4 h-4 text-violet-300" />
              涨粉潜力指数怎么算
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              爆款榜看的是「这条推文火不火」，涨粉榜看的是「这个人值不值得关注」——
              所以把同一位作者窗口内的所有上榜推文聚到一起算。
            </p>

            <div className="space-y-3 mb-5">
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">互动总量</span>
                  <span className="text-violet-300 font-mono font-bold">70%</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  该作者所有上榜推文的加权互动分之和，对数压缩成 0–100。
                </p>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">稳定输出</span>
                  <span className="text-violet-300 font-mono font-bold">20%</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  上榜 5 条即为满分。一次运气爆款不如持续被榜单收录。
                </p>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">收藏密度</span>
                  <span className="text-violet-300 font-mono font-bold">10%</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  平均每条收藏，2000 为满分。收藏高 = 干货多 = 值得关注。
                </p>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 text-[11px] text-zinc-600 font-mono leading-relaxed">
              index = 互动量×0.7 + 稳定输出×0.2 + 收藏密度×0.1
            </div>

            <Link
              href="/"
              className="mt-6 w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>回爆款榜找选题</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
