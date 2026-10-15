import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * 平时(本地 / Vercel)是完整的 Next 应用:API 路由 + Cron + Supabase。
 * 只有 GitHub Pages 那种纯静态托管才需要 STATIC_EXPORT=1,
 * 此时页面自动切到演示数据(见 app/page.tsx 的 STATIC_DEMO)。
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  cacheComponents: !isStaticExport,
  partialPrefetching: !isStaticExport,
  ...(isStaticExport
    ? {
        output: "export" as const,
        // Pages 是项目页(https://<user>.github.io/x-bangdan/),资源要带前缀
        basePath: basePath || undefined,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    // 显式锁定根目录,避免上一级目录的 lockfile 让 Turbopack 认错工作区
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
