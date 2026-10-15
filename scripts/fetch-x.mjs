#!/usr/bin/env node
/**
 * 本地 / 服务器 crontab 用的抓取脚本。
 *
 *   node scripts/fetch-x.mjs                       # 用 .env.local 里的 APIFY_TOKEN 真抓
 *   node scripts/fetch-x.mjs --dry-run             # 只抓 + 打分 + 打印,不写数据库
 *   node scripts/fetch-x.mjs --source=mock         # 用假数据跑通链路自测
 *   node scripts/fetch-x.mjs --max-items=200 --query='lang:zh-cn min_faves:300 -filter:replies since:2026-10-01'
 *
 * crontab 示例(每小时 05 分跑一次):
 *   5 * * * * cd /path/to/x-bangdan && /usr/bin/env node scripts/fetch-x.mjs >> /var/log/x-bangdan.log 2>&1
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runXIngest } from "../lib/x-pipeline.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 极简 .env 解析,避免为了一个脚本装 dotenv */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const result = await runXIngest({
  source: value("source"),
  dryRun: flag("dry-run") || !process.env.SUPABASE_SERVICE_ROLE_KEY,
  maxItems: value("max-items") ? Number(value("max-items")) : undefined,
  searchQuery: value("query"),
}).catch((error) => {
  console.error("❌ 抓取失败:", error.message);
  process.exit(1);
});

console.log("✅ 抓取完成");
console.log(
  JSON.stringify(
    {
      source: result.source,
      searchQuery: result.searchQuery,
      fetched: result.fetched,
      qualified: result.qualified,
      upserted: result.upserted,
      dryRun: result.dryRun,
      top5: result.top,
    },
    null,
    2,
  ),
);
if (result.dryRun) {
  console.log("\nℹ️  演练模式:数据没有写库。配好 SUPABASE_SERVICE_ROLE_KEY 后去掉 --dry-run 即可入库。");
}
