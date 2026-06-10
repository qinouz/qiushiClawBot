# 抖音 / 视频号热点短视频供应链落地方案

## 1. 项目目标

搭建一套能稳定产出抖音和视频号短视频的内容供应链。

第一阶段不追求全自动生成视频，先跑通：

```text
热点采集 -> 选题筛选 -> 脚本生成 -> 分镜生成 -> 人工剪映出片 -> 发布复盘
```

核心目标：

- 每天稳定产出 1 条可发布短视频。
- 每条视频有清晰选题来源、脚本、分镜、素材和复盘数据。
- 后续可以逐步自动化 TTS、字幕、Remotion 渲染。

暂不做：

- 完整 Agent 自主决策。
- 一比一复刻别人视频。
- 高成本 AI 视频生成。
- 复杂运营后台。

## 2. 内容方向

建议第一版做：

```text
热点解释型短视频
```

适合平台：

- 抖音：节奏快、开头强、观点更锋利。
- 视频号：表达稳、解释清楚、观点更可信。

单条视频规格：

```text
时长：30-60 秒
比例：9:16
风格：大字幕 + 热点截图 + 文字卡片 + 简单动效
形式：旁白口播，不强依赖真人出镜
```

脚本结构：

```text
0-3 秒：反常识 / 冲突开头
3-15 秒：发生了什么
15-40 秒：为什么重要
40-55 秒：给出判断
55-60 秒：一句收尾
```

## 3. 总体流水线

```text
NewsNow / 热榜
-> hot-fetcher
-> topic-picker
-> script-writer
-> scene-writer
-> asset-prep
-> manual-editor
-> publisher
-> analytics
```

第一阶段只实现前四步和复盘记录：

```text
hot-fetcher
topic-picker
script-writer
scene-writer
analytics
```

剪辑先人工用剪映完成。

## 4. 项目目录

新建项目建议叫：

```text
hot-video-pipeline
```

目录结构：

```text
hot-video-pipeline/
  README.md
  package.json
  .env
  .env.example

  data/
    raw/            # 原始热点
    topics/         # 选题筛选结果
    scripts/        # 口播脚本
    scenes/         # 分镜 JSON
    assets/         # 截图、图片、素材
    videos/         # 成片
    analytics/      # 发布复盘
    logs/

  src/
    workflow.js
    hot-fetcher.js
    topic-picker.js
    script-writer.js
    scene-writer.js
    analytics-writer.js

    lib/
      config.js
      newsnow.js
      llm.js
      file-store.js
      safety.js
      ids.js
```

## 5. 环境变量

`.env.example`：

```env
NEWSNOW_BASE_URL=https://newsnow.busiyi.world

OPENAI_API_KEY=
MODEL=gpt-4.1-mini

RUN_LIMIT=20
TOPIC_LIMIT=3
SCRIPT_DURATION_SECONDS=60

OUTPUT_DIR=data
```

如果暂时不用 OpenAI，可以先让脚本生成器输出模板占位，后面再接模型。

## 6. 数据流设计

### 6.1 runId

每次运行生成一个 `runId`：

```text
2026-06-06-1500
```

所有文件都围绕这个 runId 保存。

### 6.2 原始热点文件

路径：

```text
data/raw/2026-06-06-1500.json
```

结构：

```json
{
  "runId": "2026-06-06-1500",
  "fetchedAt": "2026-06-06T15:00:00+08:00",
  "source": "newsnow:hottest",
  "items": [
    {
      "id": "hot_001",
      "rank": 1,
      "title": "热点标题",
      "url": "https://...",
      "source": "微博",
      "heat": "123万",
      "summary": ""
    }
  ]
}
```

### 6.3 选题文件

路径：

```text
data/topics/2026-06-06-1500.json
```

结构：

```json
{
  "runId": "2026-06-06-1500",
  "topics": [
    {
      "id": "topic_001",
      "sourceHotId": "hot_001",
      "sourceTitle": "原始热点标题",
      "title": "适合短视频的选题标题",
      "angle": "切入角度",
      "audience": "普通上班族",
      "whyNow": "为什么现在值得讲",
      "riskLevel": "low",
      "score": 8,
      "reason": "适合一分钟解释型视频"
    }
  ]
}
```

### 6.4 脚本文件

路径：

```text
data/scripts/2026-06-06-1500-topic_001.json
```

结构：

```json
{
  "runId": "2026-06-06-1500",
  "topicId": "topic_001",
  "platform": "base",
  "title": "视频标题",
  "coverText": "封面大字",
  "durationTarget": 60,
  "hook": "前三秒开头",
  "voiceover": "完整口播稿",
  "sections": [
    {
      "name": "hook",
      "text": "开头"
    },
    {
      "name": "context",
      "text": "发生了什么"
    },
    {
      "name": "explain",
      "text": "为什么重要"
    },
    {
      "name": "takeaway",
      "text": "结论"
    }
  ],
  "douyinTitle": "抖音标题",
  "shipinhaoTitle": "视频号标题"
}
```

### 6.5 分镜文件

路径：

```text
data/scenes/2026-06-06-1500-topic_001.json
```

结构：

```json
{
  "runId": "2026-06-06-1500",
  "topicId": "topic_001",
  "style": "dark-news-card",
  "scenes": [
    {
      "index": 1,
      "duration": 3,
      "type": "headline",
      "text": "这件事很多人看反了",
      "visual": "黑底大字，关键词黄色高亮",
      "assetHint": "不需要素材",
      "emphasis": ["看反了"]
    },
    {
      "index": 2,
      "duration": 7,
      "type": "news-card",
      "text": "先看发生了什么",
      "visual": "热榜截图做背景，前景放三行解释",
      "assetHint": "需要热点截图",
      "emphasis": ["发生了什么"]
    }
  ]
}
```

## 7. 各模块职责

### 7.1 hot-fetcher

命令：

```bash
node src/hot-fetcher.js
```

职责：

- 抓取 NewsNow 热点。
- 标准化字段。
- 去掉明显无效标题。
- 保存到 `data/raw`。

第一版可以先人工粘贴热点 HTML 或 JSON，不必一开始完美抓取。

输出：

```text
data/raw/<runId>.json
```

### 7.2 topic-picker

命令：

```bash
node src/topic-picker.js data/raw/<runId>.json
```

职责：

- 从热点里选出 3 个候选。
- 给每个候选打分。
- 判断风险。
- 输出短视频切入角度。

筛选标准：

```text
能否 60 秒讲清楚
是否有反差
是否有普通人关注点
是否能配画面
是否低风险
是否不需要大量背景知识
```

风险等级：

```text
low    可以做
medium 谨慎做
high   不做
```

### 7.3 script-writer

命令：

```bash
node src/script-writer.js data/topics/<runId>.json
```

职责：

- 给每个 topic 写 45-60 秒口播稿。
- 同时生成抖音标题和视频号标题。
- 控制句子短、节奏快。

脚本要求：

```text
不要长句
不要官腔
不要堆概念
每 5-8 秒有一个信息点
不要写无法验证的结论
```

### 7.4 scene-writer

命令：

```bash
node src/scene-writer.js data/scripts/<scriptFile>.json
```

职责：

- 把口播拆成 6-10 个镜头。
- 每个镜头给出字幕、画面形式、素材提示。
- 让剪辑时照着做。

第一版分镜类型固定：

```text
headline
news-card
number-card
compare
quote
takeaway
```

### 7.5 analytics-writer

命令：

```bash
node src/analytics-writer.js
```

职责：

- 记录已发布视频的数据。
- 不需要自动抓平台数据，第一版手动录入。

结构：

```json
{
  "videoId": "2026-06-06-topic_001-douyin",
  "platform": "douyin",
  "publishTime": "2026-06-06T20:00:00+08:00",
  "title": "标题",
  "views": 0,
  "likes": 0,
  "comments": 0,
  "shares": 0,
  "completionRate": null,
  "notes": "复盘备注"
}
```

## 8. LLM 提示词模板

### 8.1 选题筛选提示词

```text
你是短视频选题编辑。请从下面热点中筛选出最适合做 30-60 秒解释型短视频的 3 个选题。

筛选标准：
1. 普通人关心
2. 60 秒能讲清楚
3. 有反差或误解点
4. 画面可以用截图、文字卡片表达
5. 风险低，不涉及过度敏感内容

请输出 JSON，不要输出多余文字。

输入热点：
{{hotItems}}

输出格式：
{
  "topics": [
    {
      "sourceHotId": "",
      "sourceTitle": "",
      "title": "",
      "angle": "",
      "audience": "",
      "whyNow": "",
      "riskLevel": "low|medium|high",
      "score": 1,
      "reason": ""
    }
  ]
}
```

### 8.2 脚本生成提示词

```text
你是短视频口播编导。请基于选题生成一条 45-60 秒的热点解释型短视频脚本。

要求：
1. 前 3 秒必须有钩子。
2. 语言短、直接、像人说话。
3. 不要夸大，不要编造事实。
4. 适合抖音和视频号。
5. 结尾给一个克制判断。

选题：
{{topic}}

请输出 JSON：
{
  "title": "",
  "coverText": "",
  "durationTarget": 60,
  "hook": "",
  "voiceover": "",
  "sections": [
    { "name": "hook", "text": "" },
    { "name": "context", "text": "" },
    { "name": "explain", "text": "" },
    { "name": "takeaway", "text": "" }
  ],
  "douyinTitle": "",
  "shipinhaoTitle": ""
}
```

### 8.3 分镜生成提示词

```text
你是短视频分镜设计师。请把下面口播稿拆成 6-10 个竖屏短视频镜头。

限制：
1. 不使用复杂 AI 视频。
2. 只使用：热榜截图、网页截图、文字卡片、数字卡片、简单图标、免费素材。
3. 每个镜头 3-8 秒。
4. 每个镜头要给出画面说明和素材提示。

脚本：
{{script}}

请输出 JSON：
{
  "style": "dark-news-card",
  "scenes": [
    {
      "index": 1,
      "duration": 3,
      "type": "headline|news-card|number-card|compare|quote|takeaway",
      "text": "",
      "visual": "",
      "assetHint": "",
      "emphasis": []
    }
  ]
}
```

## 9. 剪映制作规范

第一阶段人工剪映，统一模板。

画面规范：

```text
比例：9:16
背景：深色或模糊截图
主字：白色
关键词：黄色或红色
字体：粗体无衬线
字幕：不超过两行
每屏字数：8-18 字
```

节奏规范：

```text
0-3 秒必须出现大字钩子
3-15 秒交代事实
每 5-8 秒切一次画面
结尾不要拖泥带水
```

素材规范：

```text
优先用热榜截图
其次用网页截图
再用免费素材
不要用明显侵权视频片段
不要复制别人原视频画面
```

## 10. 发布规范

### 抖音

标题：

```text
更强冲突
更短
更像问题或反常识
```

例：

```text
这件事，很多人看反了
```

### 视频号

标题：

```text
更稳
更解释型
更像观点
```

例：

```text
这件事背后，有一个值得注意的信号
```

## 11. 复盘机制

每天记录：

```text
发了什么
哪个平台
播放量
点赞
评论
转发
完播率
你自己的判断
```

重点不是单条爆不爆，而是 14 天后看规律。

复盘表字段：

```json
{
  "date": "2026-06-06",
  "platform": "douyin",
  "topic": "",
  "title": "",
  "hookType": "反常识",
  "views": 0,
  "likes": 0,
  "comments": 0,
  "shares": 0,
  "completionRate": null,
  "notes": ""
}
```

## 12. MVP 排期

### Day 1

目标：项目能跑起来。

任务：

- 创建项目目录。
- 建好 `data` 和 `src`。
- 实现 `hot-fetcher`，能保存热点 JSON。
- 手动选 1 个热点，跑通文件保存。

验收：

```text
data/raw/<runId>.json 存在，并且有热点列表
```

### Day 2

目标：生成选题和脚本。

任务：

- 实现 `topic-picker`。
- 实现 `script-writer`。
- 接入 LLM。
- 生成 3 个脚本。

验收：

```text
data/topics/<runId>.json
data/scripts/<runId>-topic_001.json
```

### Day 3

目标：生成分镜。

任务：

- 实现 `scene-writer`。
- 生成剪映可执行分镜。
- 人工用剪映做 1 条。

验收：

```text
data/scenes/<runId>-topic_001.json
剪映导出 1 条视频
```

### Day 4-7

目标：连续发布。

任务：

- 每天跑一遍流水线。
- 每天发 1 条抖音或视频号。
- 记录数据。

验收：

```text
连续 4 天有成片和复盘记录
```

### Day 8-14

目标：找规律。

任务：

- 固定一种模板。
- 测试不同 hook。
- 记录播放和互动。

验收：

```text
至少 10 条视频
知道哪类选题/开头更好
```

## 13. 后续自动化路线

如果第一阶段证明脚本有价值，再加自动化。

### 第二阶段：TTS

新增：

```text
src/tts-maker.js
```

输出：

```text
data/assets/audio/<runId>-topic_001.mp3
```

### 第三阶段：字幕时间轴

新增：

```text
src/subtitle-aligner.js
```

输出：

```text
data/assets/subtitles/<runId>-topic_001.words.json
```

### 第四阶段：Remotion 渲染

新增：

```text
renderer/
  remotion.config.ts
  src/Video.tsx
```

输入：

```text
scenes.json
audio.mp3
words.json
```

输出：

```text
data/videos/<runId>-topic_001.mp4
```

## 14. 风险控制

不要做：

```text
政治敏感
未经证实的爆料
医疗建议
金融投资建议
灾难娱乐化
照搬别人原文案
照搬别人原画面
```

每条视频发布前检查：

```text
事实是否能追溯
结论是否过度
标题是否夸大
是否侵犯原视频版权
是否可能误导
```

## 15. 第一版成功标准

不是“播放量爆了”，而是：

```text
每天能稳定选出题
脚本质量能看
分镜能直接给剪映用
一周能发 5-7 条
复盘能看出一点趋势
```

如果一周后你发现：

```text
脚本不想改太多
分镜能直接剪
选题有几个确实不错
```

这个供应链就值得继续自动化。

如果一周后发现：

```text
脚本都不能用
选题没感觉
剪出来不像样
```

先别做 Remotion，应该回头调选题和模板。

## 16. 下午开工清单

回家后按这个顺序做：

```text
1. 新建 hot-video-pipeline
2. 创建目录结构
3. 写 .env.example
4. 写 hot-fetcher.js
5. 手动或自动拿 NewsNow 20 个热点
6. 写 topic-picker.js
7. 写 script-writer.js
8. 写 scene-writer.js
9. 生成第一份 scenes.json
10. 用剪映手工做第一条
```

第一天不要碰：

```text
TTS
Whisper
Remotion
自动发布
复杂后台
```

先验证最核心的一件事：

```text
这条供应链能不能稳定产出“值得剪”的脚本。
```
