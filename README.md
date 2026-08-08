# ListenFeed

一个移动优先的英语听力 Audio Feed。用户进入题目后自动播放音频，可无限回放、选择答案并查看逐句文本。

## 存储与成本策略

| 数据 | 存储位置 | 原因 |
| --- | --- | --- |
| 题目、选项、答案、逐句文本、音频元数据 | Neon Postgres | 结构化、可检索、便于后续 CMS 和发布流程 |
| MP3 音频 | 公共不可变对象/CDN | 音频不写入 Postgres，也不经过 Vercel Function 代理 |
| 已发布 Feed 快照 | Next.js 静态构建 | 浏览和回放产生 0 次数据库查询、0 次 Function 调用 |
| 答题状态 | 浏览器本地状态（后续可用 IndexedDB） | 匿名用户行为不产生数据库写入 |

当前 MVP 使用 `output: "export"` 输出纯静态站点。音频直接从 CDN 缓存，`preload="metadata"` 避免进入页面就下载完整 Feed；只有当前题目播放时才传输音频。播放器在客户端循环使用同一个 URL，浏览器缓存命中后无限回放不会重复调用函数或数据库。

正式扩展建议：

1. 原始 MP3 上传至 Cloudflare R2（零出口费用）或 Vercel Blob 公共对象；使用内容哈希命名并设置 `Cache-Control: public, max-age=31536000, immutable`。
2. Neon 只保存 `public_url`、时长、大小、哈希等元数据，表结构见 `database/001_initial_schema.sql`。
3. 发布时由 CI 从 Neon 拉取 `published` 内容生成静态 Feed JSON，而不是让每位访客实时查询 Neon。
4. 分页快照每页 10–20 道题，客户端只预取下一题音频的 metadata，不预取完整音频。
5. 不记录每次播放事件；如需分析，使用抽样或按会话聚合后批量写入，避免消耗 Neon 写入和 Vercel Function 配额。

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

静态输出位于 `out/`。

## 替换音频

将测试文件放到 `public/audio/coffee-shop-en.mp3`，无需修改代码。后续新增音频时，更新 `data/feed.ts` 中的题目数据；进入正式发布流程后改由 Neon 内容表生成该快照。
