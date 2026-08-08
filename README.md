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

## 信息流算法

`lib/feed-algorithm.ts` 按页产出条目。当前实现从库中无限循环取，每走完一轮轮转起始位置，避免顺序完全重复。滚动接近末尾时自动追加下一页。

`IntersectionObserver` 保证同时只有当前可见的那条在播放。

## 本地开发

```bash
npm install
npm run dev
```

生产构建（静态输出在 `out/`）：

```bash
npm run build
```

## 新增音频

1. 用 `scripts/encode-audio.sh` 从母带生成两种编码（Opus/MP3），记下 `duration_ms`。
2. 上传到 R2（见下方「R2 媒体运维」），拿到内容哈希对应的对象键。
3. 在 `data/library.ts` 追加一条，`audio.webm`/`audio.mp3` 填 R2 相对键（如 `/audio/<hash>/speech.webm`），再补 `durationMs`、题目、选项、答案和逐句文本。

信息流会自动把新条目纳入循环。进入阶段三后，这份库数据改由 Neon 内容表在发布时生成。

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
