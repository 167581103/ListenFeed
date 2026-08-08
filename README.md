# ListenFeed

一个类 TikTok 的英语听力无限下滑流。每条是一道听力题：进入即自动播放，先只显示题目，音频接近尾声时选项自然淡入，单击即选。音频可无限次回放。

线上地址：https://listenfeed-tau.vercel.app

## 存储策略

分两类数据，走两条完全不同的路径。

### 结构化数据（题目、选项、答案、逐句文本、音频元数据）

存 **Neon Postgres**，表结构见 `database/001_initial_schema.sql`。音频字节永不入库，库里只放 `public_url`、`duration_ms`、`byte_size`、`content_hash`。

关键约束：**运行时不查询数据库**。Neon 是内容后台（CMS）的存储，不是请求路径上的依赖。发布时把 `status = 'published'` 的内容导出成静态快照，访客浏览时 0 次数据库查询、0 次 Serverless Function 调用。

库变大后，快照按页拆成 `/feed/page-0.json`、`page-1.json` …，仍是纯静态文件、仍走 CDN 缓存，客户端滚动时按需取下一页。

### 音频文件

音频属于非结构化大文件，最终归宿是对象存储。但**成本瓶颈不是存储，是出口流量（egress）**，所以选型完全由 egress 定价决定。

| 方案 | 存储 | 出口流量 | 结论 |
| --- | --- | --- | --- |
| 随部署发布（当前） | 免费 | 计入 Vercel Fast Data Transfer（Hobby 100 GB/月） | 前期最省事，受部署包体积限制 |
| **Cloudflare R2** | $0.015/GB-月，前 10 GB 免费 | **免费** | **规模化首选** |
| Vercel Blob | Hobby 限额内免费 | 计费（Blob Data Transfer） | 最方便，但流量要钱 |
| Amazon S3 | $0.023/GB-月 | 约 $0.09/GB | 不推荐，成本结构最差 |

**不需要申请 S3。** S3 的 egress 计费对"反复流式播放音频"这种负载是最差的成本结构。R2 完全兼容 S3 API（同一套 SDK 和调用方式），但 egress 免费——这正是音频 Feed 最需要的那一项。

### 三阶段迁移路径

**阶段一：随部署发布（当前，约 0–100 条）**

音频作为静态资源放在 `public/audio/`，随部署上 Vercel CDN。零额外服务、零配置。

硬上限是 Vercel CLI 部署源文件大小：**Hobby 100 MB / Pro 1 GB**。按下面优化后的体积算，Hobby 大约能放 300–400 条。

**阶段二：迁到 R2（约 100 条以上，或需要不重新部署就上新内容）**

设置环境变量 `NEXT_PUBLIC_MEDIA_BASE_URL` 指向 R2 公共域名即可。`lib/media.ts` 会把库里的相对路径拼成绝对 URL，**库数据和组件代码都不用改**。

同时给 R2 桶配 `Cache-Control: public, max-age=31536000, immutable`。

**阶段三：内容后台**

音频入 R2、元数据入 Neon，发布时生成分页静态快照。

## 控制成本的具体手段

**1. 音频编码（影响最大）**

原始素材是 160 kbps，对语音是严重浪费。`scripts/encode-audio.sh` 会输出两种网页编码：

```bash
./scripts/encode-audio.sh <master-audio> <slug>
```

以 45 秒的咖啡馆对话为例：

| 编码 | 体积 | 相对原始 |
| --- | --- | --- |
| 原始 160 kbps mono | 904 KB | — |
| MP3 64 kbps mono | 362 KB | 2.5x 更小 |
| Opus 32 kbps mono | 186 KB | **4.9x 更小** |

`<audio>` 里 Opus 排在前、MP3 兜底，浏览器自动选它能解码的那个。支持 Opus 的设备省一半流量，其余设备也比原始素材小 2.5 倍。

这一项直接决定 Hobby 的 100 GB/月能撑多久：按每次会话看 20 条估算，未优化约 5,500 次会话，优化后约 27,000 次。

**2. 文件名带内容哈希**

`coffee-shop-en.f5358909.mp3`。因为设了一年 `immutable` 缓存，同名换内容会让老用户一直拿到旧文件。哈希命名让缓存永远安全，也天然适配 R2 的内容寻址，还和 Neon 的 `content_hash` 字段对应。

**3. `preload="none"`**

Feed 里同时存在多张卡片，只有真正播放的那条才传字节。进入页面不会预下载整个 Feed 的音频。

**4. 无限回放不产生额外流量**

配合 `immutable` 长缓存，同一条反复回放基本都是浏览器缓存命中，既不打 CDN 也不打数据库。

**5. 纯静态导出**

`output: "export"`，不产生任何 Serverless Function，所以没有函数调用和执行时长的消耗。

**6. 不记录逐次播放事件**

匿名答题状态只存在客户端。需要分析时用抽样或按会话聚合后批量写入，避免把 Neon 写入配额和函数调用耗在埋点上。

## Feed 发布契约(读写解耦)

前台**不查数据库、不进代码包读内容**。内容以**分页静态快照**的形式发布到 R2/CDN,前台运行时按需拉取。这套契约是内容管线(Neon + 内容工厂)与静态前台之间**唯一的耦合点**(CQRS 读写分离思路:Neon 是写模型,静态快照是为读优化的物化视图)。

```text
feed/latest.json            # 小指针,短缓存 + SWR:{ latestPage, count, maxSeq, ... }
feed/page-00000.json        # 整页不可变(长缓存);最后一页未满时短缓存
feed/page-00001.json        # 只追加,历史页永不变 → CDN 可永久缓存
```

发布任务(`npm run feed:publish`,见 `scripts/publish-feed.ts`):
- 数据源是 **Neon**:读 `feed_items`(`status='published'`)按 `published_seq` 升序,`audio` 键由 `content_hash` 推导(R2 内容寻址布局)。需要 `DATABASE_URL`。
- `published_seq` 在**首次发布时**分配(全局单调、只增),据此分页 → 历史页不可变。
- **先写完所有页、最后才更新 `latest.json` 指针**,保证前台任何时刻读到的都是完整状态;并记一条 `publish_snapshots`。

```bash
npm run feed:publish                      # 发布到 R2
npm run feed:publish -- --page-size 20    # 指定分页大小
npm run feed:publish -- --out .feed-out   # 只写本地,不上传(便于检查)
npm run feed:publish -- --dry-run
```

> **互不干扰**:内容工厂只写 Neon + R2,前台只读 CDN;后台狂塞不压前台,加内容也**不需要重新部署前端**。未来可加一个独立的"导入接口"服务(内容工厂调用它写 Neon/上传 R2、触发发布任务),前台完全无感。

## 内容管线(CMS 工具箱)

内容的权威源是 **Neon**;写路径工具箱在 `scripts/cms/` 下(仅 ops/CLI,**绝不进前端包**,凭据 `DATABASE_URL` + R2 只在服务端)。你的内容工厂(独立项目)直接调这些 CLI 或 `import` 这些函数,不需要部署任何 HTTP 服务。schema 见 `database/001_initial_schema.sql` + `database/002_content_pipeline.sql`,状态机 `generated → draft → reviewing → published → archived`。

```bash
npm run db:migrate                                   # 幂等迁移(建表/加列)
npm run content:import -- --file items.json          # 批量导入为草稿(见下)
npm run content:import -- --from-library             # 从 data/library.ts 迁移种子
npm run content:approve -- --external-id <id>        # 审核发布(治理闸口;分配 published_seq)
npm run content:approve -- --all-drafts
npm run feed:publish                                 # Neon(published) → R2 静态快照
```

导入项契约(`ImportItem`,见 `scripts/cms/validate.ts`):`externalId`(**幂等键**)、`question`、`options`、`answerId`、`transcript?`,音频三选一——`masterPath`(本地母带,自动 `ffmpeg` 转码 + 上传 R2)/ `audioContentHash`(引用已上传的 `audio/{hash}/...`)/ `audio:{webm,mp3}`(显式键);可选 `level/topic/...` 等特征。导入是**幂等的**(按 `external_id` upsert,重复导入只更新、不重复),并生成 `import_job` + 逐条 `import_job_item`(结果含总数/成功/失败/原因/是否可重试);每次变更写 `audit_logs`,并存 `content_versions` 版本快照。

> 治理:Agent/内容工厂只能创建/更新**草稿**;`content:approve`(发布)是人工闸口(对应 `audit_logs` 里的 `publish`)。`tags / feed_item_tags / generation_runs` 等表已建好,供后续标签召回与 Agentic 溯源使用。

## 前台选片 / 去重(客户端)

前台运行时从 CDN 拉分页(`lib/feed-source.ts`),用 `localStorage` 记录"看过哪些"(`lib/seen-store.ts`),再由纯函数 `lib/feed-select.ts` 决定下一条(`lib/use-feed.ts` 负责编排缓冲与轮询):

- **未看优先**:一轮内不重复;最新内容(高 `seq`)优先冒头。
- **刷完一轮**:按"最久没看"回放,且跳过最近几条,避免连续重播。
- 定时轮询 `latest.json`,内容工厂新发布的内容会自动出现,无需重新部署。
- `IntersectionObserver` 保证同时只有当前可见的那条在播放。

排序目前是"新鲜度优先"的规则实现(在 `feed-select.ts` 里,便于替换);后续接入行为数据后可在此做本地个性化重排,或(有账号时)由边缘函数返回个性化 id 列表,载荷仍走静态 CDN。

## 本地开发

```bash
npm install
npm run dev
```

前台内容来自 R2 快照:设置 `NEXT_PUBLIC_MEDIA_BASE_URL`(公开媒体基址);要有内容需先建库并发布一次(需 `DATABASE_URL`):`npm run db:migrate` → `npm run content:import -- --from-library` → `npm run content:approve -- --all-drafts` → `npm run feed:publish`(或 `feed:publish -- --out .feed-out` 写本地自行托管)。测试:`npm test`(选片 + 导入校验单测,不需数据库)。

生产构建（静态输出在 `out/`）：

```bash
npm run build
```

## 新增内容

走内容管线(见上「内容管线(CMS 工具箱)」):写一个 `ImportItem`(音频用 `masterPath` 让工具箱转码上传,或引用已上传的 `audioContentHash`)→ `content:import` 建草稿 → `content:approve` 发布 → `feed:publish` 生成快照。前台会在轮询到新 `latest.json` 后自动刷到,无需重新部署。

`data/library.ts` 现在只作为**种子夹具**(`content:import --from-library` 一次性迁移历史内容);新内容不再往它里加。

## R2 媒体运维

音频走两桶：`R2_BUCKET_MASTERS`（私有，原始母带）与 `R2_BUCKET_MEDIA`（公开，优化后的 Opus/MP3）。对象采用内容寻址布局：

```text
audio/{content_hash}/master.wav   # 私有母带
audio/{content_hash}/speech.webm  # 公开 Opus
audio/{content_hash}/speech.mp3   # 公开 MP3
```

运维脚本（凭据来自环境变量 / Cloud Agents Secrets，**绝不入库**，见 `.env.example`）：

```bash
# 上传一条音频（幂等；公开对象带一年 immutable 缓存）
npm run media:upload -- --slug <slug> --webm <file.webm> --mp3 <file.mp3> [--master <file.wav>]

# 为公开媒体桶配置 CORS（允许 app 各来源的 GET/HEAD 与 range 请求）
node scripts/configure-cors.mjs
```

> **公开 URL 与 S3 端点的区别**：`R2_PUBLIC_BASE_URL` 是 SDK 用于**签名读写**的 S3 端点
> （`https://<account>.r2.cloudflarestorage.com`），**不可**直接公开访问。浏览器播放需要一个
> **公开** 基址——桶的 `https://pub-XXXX.r2.dev` 或自定义域 `https://media.listenfeed.online`——
> 并将其设为 Vercel 的 `NEXT_PUBLIC_MEDIA_BASE_URL`。`lib/media.ts` 会把库里的相对键拼成绝对 URL，
> 库数据与组件代码都无需改动。
