# SmartBookmark Hub 技术方案

> 版本：v1.2 ｜ 日期：2026-11-09 ｜ 状态：已定稿，作为实现依据
> 配套实施计划：[实施计划.md](./实施计划.md)
> 变更同步说明见文末「13. 变更记录」（v1.1 / v1.2）。

---

## 1. 目标与范围

### 1.1 一句话目标

在**完全保留 Chrome 原生收藏夹**的前提下，为浏览器书签提供「可视化首页 + 书签优先的全局搜索 + 已有书签的批量治理」三件能力。

### 1.2 用户明确要求（必须全部落地）

| # | 要求 | 落地形态 |
|---|---|---|
| R1 | 增强浏览器书签管理器、管理内容 | `options.html` 管理台：树形浏览、增删改、拖拽移动、批量选择、标签、重命名 |
| R2 | 新增首页页面，展示**用户选择的浏览器文件夹** | `newtab.html` 接管新标签页；文件夹选择器决定首页展示哪些原生文件夹，按文件夹分区展示卡片 |
| R3 | 增强浏览器搜索，**优先搜索书签管理器内容** | 三处入口统一走同一搜索引擎：地址栏 omnibox（关键字 `bm`）、页面内搜索框、popup 快捷搜索；排序恒定「书签 > 历史 > 网页」 |
| R4 | 提升搜索效率 | 本地内存索引 + 拼音首字母/全拼 + URL 片段 + 标签多维模糊匹配；键盘上下选择、回车打开、Esc 关闭；输入防抖 |
| R5 | 对已有书签进行管理 | 智能清理：死链检测、重复链接合并、空文件夹清理；全部经「预览 → 确认 → 回收站 → 撤销」链路 |

### 1.3 原始规格中的附加项（一并实现）

- 首页多页签（工作/学习/娱乐等自定义分组）、亮/暗模式、自定义背景
- 全局搜索快捷键 `Ctrl+Shift+F`
- 死链检测可配置并发数与超时
- 标准 Netscape HTML 导出备份
- 数据仅存本地，绝不上传服务器

### 1.4 明确不做（YAGNI）

- 云同步、账号体系、远程后端、任何 telemetry
- 书签内容全文抓取/网页正文索引
- 自动定时后台扫描（MV3 Service Worker 生命周期不可靠，改为用户触发 + 断点续扫）
- 修改 Chrome 原生书签栏 UI

---

## 2. 技术选型

| 领域 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 扩展规范 | Manifest V3 | `minimum_chrome_version: 116` | omnibox / favicon / action.openPopup 等能力齐备 |
| 构建 | Vite | 8.3.6 | 多入口 HTML 构建 + 资源哈希，产物直接可加载 |
| React 插件 | @vitejs/plugin-react | 6.2.1 | 官方 Babel 插件，HMR 稳定 |
| UI | React + React DOM | 19.3.1 | 并发渲染、`useSyncExternalStore` 订阅外部 store |
| 语言 | TypeScript | 5.9.x（锁定 5 系） | TS 7 为原生重写版，生态类型工具链尚在跟进，5.9 最稳 |
| 样式 | Tailwind CSS + @tailwindcss/vite | 4.3.5 | `@theme` 直接定义设计令牌，无额外配置文件 |
| 状态 | zustand | 5.1.0 | 单一 store，页面与 SW 共用 vanilla store，避免多源状态 |
| 拼音 | pinyin-pro | 3.29.5 | 首字母/全拼，纯本地、无网络 |
| 本地大缓存 | idb-keyval | 6.3.0 | IndexedDB 存索引/死链结果/回收站，绕开 storage.local 10MB 配额 |
| 图标 | lucide-react | 1.70.0 | 统一线性图标；品牌标识手绘 SVG |
| 长列表 | @tanstack/react-virtual | 3.14.26 | 万级书签列表虚拟化 |
| 单测 | Vitest | 5.1.0 | 与 Vite 同管道，fake timers 测并发池 |
| 端到端 | Playwright | 1.65.0 | 真实 Chrome `--load-extension` 验证 |

**不引入**：CRXJS beta 插件（HMR/产物路径不可控）、UI 组件库（视觉需完全自有）、远程字体（隐私 + 离线）。

### 2.1 关键取舍说明

1. **多入口而非 CRXJS**：`vite.config.ts` 显式声明 `newtab/popup/options` 三个 HTML 入口与 `background` 入口；`background` 通过 `entryFileNames` 固定输出为 `background.js`，与 manifest 精确对应。SW 声明 `"type": "module"`。
2. **重计算用分批（Chunking）而非 Web Worker**：规格允许二选一。索引构建/去重按 400 条一批 `await yieldToBrowser()` 让出主线程；死链检测本身是异步 I/O，天然不阻塞。理由：MV3 SW 无法稳定托管 Worker，页面内 Worker 会增加产物与 CSP 复杂度，收益不抵风险。
3. **扫描运行在扩展页面上下文**：不在 SW 里跑长任务（SW 空闲约 30s 被终止）。管理台页面持有扫描循环，进度与结果每 25 条落盘 IndexedDB，关闭页面后可续扫。
4. **新标签页接管无法运行时开关**：`chrome_url_overrides.newtab` 是声明式的。方案：manifest 声明接管；同时 popup/命令/右键菜单都能打开 `newtab.html`，用户可在 Chrome 的「扩展程序控制了新的标签页」提示中自行关闭接管，首页仍可作为普通页面访问。
5. **字体全部走系统栈**：避免向第三方发请求，符合「数据仅本地」承诺，且离线可用。

---

## 3. 架构

### 3.1 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 页面层  newtab.html │ popup.html │ options.html               │
│         React 组件 + hooks，只调用 core，不直接碰 chrome.*     │
├──────────────────────────────────────────────────────────────┤
│ 核心层  src/core/*（纯 TS，无 DOM 依赖，可在 SW / 页面 / 测试跑）│
│  bookmarks │ search │ url │ pinyin │ cleaner/* │ trash        │
│  settings  │ cache  │ exportHtml │ importHtml                 │
├──────────────────────────────────────────────────────────────┤
│ 适配层  src/core/backend.ts                                    │
│   ChromeBackend（真实 chrome.*）│ DemoBackend（无 API 时种子数据）│
├──────────────────────────────────────────────────────────────┤
│ 平台层  chrome.bookmarks / history / storage / omnibox / search│
│         IndexedDB（大对象）                                     │
└──────────────────────────────────────────────────────────────┘
```

**硬约束**：`src/core/**` 不得 import React、不得直接引用 `document`/`window`（`yieldToBrowser` 除外，且需可在 Node 下降级）。所有 chrome 调用集中在 `backend.ts`，便于单测注入与 Demo 模式。

### 3.2 Service Worker 职责（`src/background/index.ts`）

- `chrome.omnibox`：`onInputStarted` / `onInputChanged`（防抖 120ms，返回书签优先建议）/ `onInputEntered`（按 disposition 打开；可导航 scheme（http/https/chrome/file/ftp/about 等）的回车项按 URL 打开，其余自由文本交给默认搜索引擎兜底）
- `chrome.commands.onCommand`：`open-hub`、`quick-search`
- `chrome.contextMenus`：选中文字 → 「用 SmartBookmark Hub 搜索」；页面 → 「收藏到 SmartBookmark Hub」
- `chrome.runtime.onMessage`：页面 ↔ SW 的薄消息路由（打开首页、请求 host 权限结果广播）
- `chrome.bookmarks.on*` → 广播 `bookmarks:changed`，页面据此重建索引
- **不做**：长任务、网络扫描、DOM 操作

### 3.3 数据流

```
chrome.bookmarks 事件 ─┐
用户操作（CRUD/拖拽）  ─┼→ BookmarkService.mutate() → chrome.bookmarks.*
                       │        ↓ 乐观更新 store
                       │   事件回流 → 400ms 防抖 → 重建 flat + 索引（分批）
                       │        ↓
                       └→ store 通知所有订阅页面（newtab / popup / options 实时同步）
```

---

## 4. 数据模型

```ts
// src/core/types.ts
export interface BookmarkNode {
  id: string; parentId?: string; index?: number;
  title: string; url?: string;
  dateAdded?: number; dateGroupModified?: number;
  children?: BookmarkNode[];
}

export interface FlatBookmark {
  id: string; title: string; url: string;
  parentId: string; folderPath: string[];   // 不含根，如 ["书签栏","工作"]
  dateAdded: number;
}

export interface SearchEntry extends FlatBookmark {
  host: string; canonicalUrl: string;
  titleLower: string; urlLower: string;
  initials: string; pinyinFull: string;     // 仅含 CJK 时计算
  tags: string[];
}

export type ResultKind = 'bookmark' | 'history' | 'web';
export interface SearchResult {
  kind: ResultKind; id: string; title: string; url: string;
  subtitle: string; score: number; matchedOn: string;
  query?: string;                           // kind === 'web' 时携带原始查询词，避免 UI 从标题文案反解
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  accent: 'gilt' | 'azure' | 'verdant' | 'magenta';
  dashboard: {
    folderIds: string[];                    // R2：用户选择的原生文件夹
    tabs: { id: string; name: string; folderIds: string[] }[];
    activeTabId: string;
    layout: 'grid' | 'list';
    cardSize: 'sm' | 'md' | 'lg';
    showStats: boolean;
    background: { type: 'aurora' | 'solid' | 'image'; value: string; revision?: number };  // revision 随换图递增，触发首屏/运行时重载
  };
  search: { includeHistory: boolean; historyDays: number; maxResults: number; debounceMs: number };
  scan: { concurrency: number; timeoutMs: number; hostDelayMs: number; cacheDays: number; ignoreWww: boolean };
  tags: Record<string, string[]>;           // bookmarkId → tags（Chrome 无原生标签）
}

export type LinkStatus = 'ok' | 'dead' | 'blocked' | 'error' | 'timeout' | 'skipped';
export interface LinkHealth {
  canonicalUrl: string; status: LinkStatus;
  httpStatus?: number; finalUrl?: string; checkedAt: number; message?: string;
}

export interface DuplicateGroup {
  key: string; reason: 'url' | 'title';
  items: FlatBookmark[]; keepId: string; similarity: number;
}

export interface DeadLinkItem { bookmark: FlatBookmark; health: LinkHealth }

export interface ScanReport {
  id: string; startedAt: number; finishedAt?: number;
  total: number; checked: number;
  deadLinks: DeadLinkItem[]; blocked: DeadLinkItem[];
  duplicates: DuplicateGroup[];
  emptyFolders: { id: string; title: string; path: string[] }[];
  cursor: number;                            // 断点续扫
  cancelled: boolean;
  checkedIds?: string[];                     // 已检测（含 ok）的书签 id：续扫据此跳过，旧报告兼容

export interface TrashBatch {
  id: string; deletedAt: number; label: string;
  nodes: TrashNode[];                        // 含子树快照与原 parentId/index
}
export interface TrashNode {
  id: string; title: string; url?: string;
  parentId: string; index: number; dateAdded?: number;
  children?: TrashNode[];
}
```

### 4.1 存储划分

| 存储 | 键 / 库 | 内容 | 配额考量 |
|---|---|---|---|
| `chrome.storage.local` | `sbh:settings` | Settings（含标签映射） | 小对象；标签超 5000 条时迁 IndexedDB |
| IndexedDB `sbh` | `cache` | 搜索索引快照、`LinkHealth`（按 canonicalUrl） | 万级书签无压力 |
| IndexedDB `sbh` | `reports` | ScanReport（最近 10 份） | 支持断点续扫 |
| IndexedDB `sbh` | `trash` | TrashBatch（最近 20 批 / 上限 2000 节点） | 撤销与回收站 |
| IndexedDB `sbh` | `assets` | 自定义背景图 Blob | 转 `blob:` URL 使用 |

---

## 5. 权限与 manifest

```json
{
  "manifest_version": 3,
  "name": "SmartBookmark Hub",
  "version": "0.1.0",
  "description": "书签优先的全局搜索、可视化首页与书签智能治理。所有数据仅保存在本地。",
  "minimum_chrome_version": "116",
  "permissions": ["bookmarks", "history", "storage", "tabs", "search", "favicon", "contextMenus"],
  "optional_host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html", "default_title": "SmartBookmark Hub" },
  "options_page": "options.html",
  "chrome_url_overrides": { "newtab": "newtab.html" },
  "omnibox": { "keyword": "bm" },
  "commands": {
    "open-hub":     { "suggested_key": { "default": "Ctrl+Shift+K" }, "description": "打开 SmartBookmark Hub 首页" },
    "quick-search": { "suggested_key": { "default": "Ctrl+Shift+F", "mac": "Command+Shift+F" }, "description": "书签优先快速搜索" }
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' https: http:; font-src 'self'; worker-src 'self'"
  }
}
```

权限说明（安装页/隐私说明中逐条展示）：

- `bookmarks`：读写原生收藏夹（R1/R2/R5 的基础）
- `history`：搜索第二优先级兜底（可在设置关闭）
- `storage`：设置持久化
- `tabs`：打开/复用标签页、读取当前标签用于「收藏当前页」
- `search`：`chrome.search.query()` 用**用户默认搜索引擎**执行网页兜底，不硬编码 Google
- `favicon`：`chrome-extension://<id>/_favicon/?pageUrl=<encoded>&size=64` 取站点图标
- `contextMenus`：选中文字搜索 / 收藏当前页
- `optional_host_permissions: <all_urls>`：**仅在用户点击「检测死链」时**通过 `chrome.permissions.request()` 申请，用于跨域读取 HTTP 状态码；未授权时扫描功能给出明确引导，其余功能不受影响

omnibox 关键字 `bm` 由 manifest 固定，运行时不可改（Chrome 限制），设置页只做说明。

---

## 6. 核心算法

### 6.1 URL 归一化（`core/url.ts`）

```
canonicalUrl(url, { ignoreWww }):
  1. 非 http/https → 原样小写返回（chrome://、file:// 等不参与去重合并）
  2. scheme/host 小写；去默认端口 80/443
  3. ignoreWww=true 时去掉 host 前缀 www.
  4. 去 hash；path 去末尾 "/"（根路径保留 "/"）
  5. query 参数排序；剔除跟踪参数：
     utm_*、fbclid、gclid、msclkid、spm、scm、ref、ref_src、ref_url、
     share_token、share_source、from、sourceid、igshid、mc_cid、mc_eid
  6. 解码 %2F 等常见转义后再比较；保留其余百分号编码原样
```

### 6.2 搜索索引与打分（`core/search.ts`）

**索引构建**：`getTree()` → 深度优先展平（跳过根 `0`）→ 每条计算 host / canonicalUrl / titleLower / urlLower / tags；标题含 CJK 时用 pinyin-pro 计算 `initials`（`pattern:'first'`）与 `pinyinFull`，结果按标题字符串 Map 缓存。每 400 条让出主线程一次。

**查询处理**：小写化 → 按空白切词（最多 6 词）→ 每词必须在**至少一个字段**命中（AND 语义），否则该条排除。

**打分表（书签）**：

| 命中方式 | 分值 |
|---|---|
| 标题全等 | +120 |
| 标题前缀 | +80 |
| 标题包含 | +55 |
| 所有词命中标题 | +40 |
| 拼音首字母全等 / 前缀 / 包含 | +90 / +60 / +35 |
| 全拼前缀 / 包含 | +55 / +30 |
| host 全等 / 前缀 | +45 / +30 |
| URL 片段命中（每词，封顶 3 词） | +25 |
| 文件夹路径命中 | +15 |
| 标签全等 / 包含 | +70 / +40 |
| 近 7 天新增 | +10 |
| 标题过长惩罚 | −min(15, len/8) |

**优先级保证**：历史结果分数强制压缩到 `≤ 40`，网页兜底项固定 `score = -1` 且永远排在最后 → 任何书签命中都排在历史与网页之前（R3）。历史结果按 canonicalUrl 与书签去重。

**兜底项**：`在默认搜索引擎中搜索“<query>”`，点击调用 `chrome.search.query({ text, disposition })`。

**性能**：1 万条索引全量扫描 < 30ms（纯字符串比较，无正则回溯）；输入防抖 300ms（omnibox 120ms）；结果上限：popup 12 / 首页 30 / omnibox 8。

### 6.3 死链检测（`core/cleaner/deadLinks.ts`）

- **并发池**：固定大小 worker 循环（默认 5，可配 1–16），共享AbortSignal，支持取消
- **同主机节流**：`Map<host, lastAt>`，同主机两次请求间隔 ≥ `hostDelayMs`（默认 250ms），避免触发防爬
- **超时**：`AbortController` + `timeoutMs`（默认 8000ms）
- **请求策略**：先 `HEAD`；若 405/501 或网络异常 → 回退 `GET`（`redirect:'follow'`，不读 body）
- **判定**：

| 情况 | 分类 | 处理 |
|---|---|---|
| 200–399 | `ok` | 记录 finalUrl；与原始 URL 差异大时提示「可更新为重定向地址」 |
| 404 / 410 / 451 | `dead` | 进入删除预览 |
| 403 / 429 / 503 | `blocked` | **不判死**，单列「被拦截/限流」，防止误删 |
| 其他 5xx | `error` | 单列「服务器错误」，建议复检 |
| 超时 | `timeout` | 单列，不计入死链 |
| 非 http(s) | `skipped` | 直接跳过 |

- **缓存**：结果按 canonicalUrl 存 IndexedDB，`cacheDays`（默认 7）内跳过；「强制重新检测」忽略缓存
- **落盘**：每 25 条写一次进度与 `cursor`，页面关闭后可从 cursor 续扫；`checkedIds` 记录已检测项（含 ok），续扫不再重复请求

### 6.4 重复检测（`core/cleaner/duplicates.ts`）

1. **URL 重复**：`Map<canonicalUrl, FlatBookmark[]>`，长度 > 1 即成组，`reason:'url'`，`similarity:1`
2. **标题重复**：
   - 先按「归一化标题」（小写、去标点空白、全角转半角）精确分桶 → 跨 host 同标题组，`reason:'title'`；泛化标题（首页/登录/Untitled/新标签页等词表）与归一化后不足 4 字符的标题**不参与跨站合并**（同 host 仍可经前缀块+相似度成组），防止「首页」类撞名跨站误删
   - 再在**同 host 桶内**做字符 bigram Dice 相似度比较（阈值默认 0.86），避免全量 O(n²)
   - Dice = `2|A∩B| / (|A|+|B|)`，CJK 按字符 bigram，拉丁按词 + 字符 bigram 双通道取最大值
3. **保留建议**：默认保留 `dateAdded` 最早者（原始收藏）；同时间则保留 canonicalUrl 更短者；用户可在预览中逐组改选
4. **绝不自动删除**：只产出报告，删除必须走预览确认

### 6.5 空文件夹（`core/cleaner/emptyFolders.ts`）

后序遍历；文件夹自身无子节点，或子节点全为「已判定空」的文件夹 → 标记为空。排除根 `0` 与特殊文件夹 `1`（书签栏）/`2`（其他书签）/`3`（移动版书签）。报告中展示完整路径，删除父文件夹即连带其空子树。

### 6.6 安全删除与撤销（`core/trash.ts`）

```
预览（勾选）→ 确认对话框（列出数量与影响）
  → snapshot(node)（文件夹递归含 children、原 parentId/index）
  → 写入 IndexedDB trash 批次
  → chrome.bookmarks.remove / removeTree（逐个删除；中途失败时批次只保留已删除节点并抛错，避免恢复产生重复）
  → store 乐观移除 + Toast「已删除 N 项 · 撤销」（8s）
撤销 → 按原 parentId/index 重建（父文件夹已不存在则重建父链，兜底挂到「其他书签」；
       恢复前 index 按目标文件夹当前子节点数收敛，规避 Chrome "Index out of bounds"；
       恢复中断时补偿已创建节点并保留批次，可幂等重试）
回收站面板 → 列出最近 20 批，支持单批恢复 / 彻底删除
```

---

## 7. 视觉与交互设计系统

### 7.1 艺术方向：「墨与鎏金」（Ink & Gilt）

主题是「私人藏书楼 / 知识星图」：大面积深墨蓝承载内容，鎏金琥珀作为主操作色，纸张暖白作为亮色模式基底，链接健康度用高饱和信号色。配色不可被移植到无关产品。

**暗色（默认）**

| 令牌 | 值 | 用途 |
|---|---|---|
| `--ink-950` | `#070B18` | 页面底 |
| `--ink-900` | `#0C1226` | 主表面 |
| `--ink-850` | `#111A35` | 次表面/侧栏 |
| `--ink-800` | `#16203F` | 卡片 |
| `--ink-700` | `#1E2A52` | 分隔/边框 |
| `--ink-600` | `#2A3868` | 强边框/hover |
| `--gilt-400` | `#F2B33D` | 主强调（鎏金） |
| `--gilt-300` | `#FFD07A` | 高亮/焦点环 |
| `--azure-400` | `#4CC3FF` | 电蓝：链接、信息 |
| `--verdant-400` | `#A8E05F` | 酸绿：链接健康 |
| `--coral-500` | `#FF6B6B` | 危险：死链、删除 |
| `--magenta-400` | `#F06BD8` | 重复项、标签 |
| `--mist-400` | `#8FA0C8` | 冷中性：次要文字 |
| `--mist-200` | `#C7D2EE` | 主要文字（暗） |

**亮色**：`--paper-50 #F4F1E8` 底、`--paper-100 #FBF9F4` 表面、`#DED6C4` 边框、`#101731` 文字；强调色降明度保对比：gilt `#B8791A`、azure `#1272B8`、verdant `#3F8F4F`、coral `#D64545`、magenta `#B8368F`。

**语义色固定**：成功 verdant / 警告 gilt / 危险 coral / 信息 azure。所有正文与控件配对对比度 ≥ 4.5:1。

**渐变**：首页背景为跨色相多段极光（ink-900 → azure 深 → magenta 深 → gilt 深）+ SVG `feTurbulence` 颗粒（data URI，本地）+ 缓慢漂移光斑；卡片边框与图标借用调色板，杜绝默认灰。

### 7.2 字体

- 展示：`"Bahnschrift", "DIN Alternate", "Avenir Next Condensed", "Segoe UI Semibold", system-ui`（紧字距、大字号、强对比）
- 正文：`"Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`
- 等宽（URL/计数/快捷键）：`"Cascadia Mono", "Consolas", "SF Mono", "Menlo", monospace`

字号阶梯：12 / 13 / 14 / 16 / 20 / 28 / 44 / 64。标题与正文形成强对比，不用平庸的中间号。

### 7.3 页面与布局

**首页 `newtab.html`**
- 首屏主题预设：三入口 HTML 在水合前经 `public/theme-boot.js` 同步应用主题（镜像 localStorage → chrome.storage 兜底），浅色用户不闪深色
- 顶部固定命令栏：品牌手绘 SVG + 名称｜居中搜索胶囊（焦点鎏金环、`Ctrl K` 提示、书签/历史/网页范围 chips）｜右侧主题切换、文件夹选择、管理台入口
- 问候条：时段问候 + 日期 + 四项真实统计（书签总数 / 文件夹数 / 近 7 天新增 / 链接健康度），数字用等宽字体
- 页签条：用户自定义分组（工作/学习/娱乐…），可增删改名，每组独立选择文件夹
- 左侧 sticky 文件夹导航（选中文件夹 + 计数 + 「选择文件夹」）
- 主区：按文件夹分区的卡片网格（尺寸 sm/md/lg 可调，grid/list 可切）
- 卡片：favicon、两行标题、等宽 host、文件夹标签、健康状态点；hover 浮起 + 露出操作（新标签打开/复制/编辑/删除）；键盘可达焦点环
- 状态：无选中文件夹 → 插画式引导 + 选择按钮；加载中 → 骨架 shimmer；API 不可用 → 明确横幅 + Demo 数据说明
- 滚动条自绘（宽度、轨道、滑块、hover 全部取自调色板）

**弹窗 `popup.html`**（360×560）：自动聚焦搜索、结果列表（书签优先分组标识）、最近搜索 chips、底部三入口（首页/管理台/健康扫描）、微型统计。

**管理台 `options.html`**：左树（展开/折叠、过滤、拖拽移动、右键菜单、内联重命名）+ 右工作区四视图：
1. 书签列表：虚拟滚动表格、批量选择、排序、过滤、详情抽屉（标题/URL/文件夹/标签）
2. 智能清理：三类报告（重复/死链/空文件夹）+ 扫描进度 + 预览确认 + 回收站
3. 备份：HTML/JSON 导出、HTML 导入（带预览，导入到独立文件夹不覆盖）
4. 设置：主题/强调色/背景、首页文件夹与页签、搜索与历史开关、扫描参数、权限状态、隐私声明

### 7.4 动效与反馈

- 入场：命令栏 → 问候条 → 页签 → 分区卡片，阶梯 60ms 位移淡入
- 交互：卡片 hover 浮起 2px + 边框借色；按钮按压回弹；所有异步操作有 loading/成功/失败三态
- 破坏性操作：确认对话框 + 删除后 Toast 撤销（8s 进度条）
- 扫描：实时进度条 + 计数 + 分类色点，可取消
- 尊重 `prefers-reduced-motion`：关闭漂移与阶梯动画
- 无音频（工具型产品，声音即噪声）

---

## 8. 目录结构

```
Hello-Chrome-Extension/
├─ docs/
│  ├─ SmartBookmark-Hub-技术方案.md
│  └─ 实施计划.md
├─ public/
│  ├─ manifest.json
│  ├─ theme-boot.js            # 首屏主题预设（水合前同步应用）
│  └─ icons/{icon16,icon32,icon48,icon128}.png
├─ newtab.html  popup.html  options.html
├─ src/
│  ├─ background/index.ts
│  ├─ core/
│  │  ├─ types.ts  backend.ts  chromeBackend.ts  demoBackend.ts  fixtures.ts
│  │  ├─ bookmarks.ts  url.ts  pinyin.ts  search.ts
│  │  ├─ settings.ts  cache.ts  store.ts  trash.ts
│  │  ├─ exportHtml.ts  importHtml.ts  format.ts
│  │  └─ cleaner/{pool.ts,deadLinks.ts,duplicates.ts,emptyFolders.ts,scan.ts}
│  ├─ ui/
│  │  ├─ styles.css
│  │  ├─ download.ts popupStack.ts openWithFeedback.ts
│  │  ├─ components/{Brand,SearchBox,ResultList,BookmarkCard,FolderSection,
│  │  │   FolderPicker,TreeView,Toast,ConfirmDialog,Drawer,Progress,
│  │  │   ThemeToggle,EmptyState,Skeleton,StatCard,TagEditor,VirtualList}.tsx
│  │  └─ hooks/{useBookmarks,useSearch,useSettings,useHotkeys,useTheme}.ts
│  ├─ pages/
│  │  ├─ newtab/{main.tsx,App.tsx,Dashboard.tsx,...}
│  │  ├─ popup/{main.tsx,App.tsx}
│  │  └─ options/{main.tsx,App.tsx,BookmarksView,CleanerView,BackupView,SettingsView}.tsx
│  └─ test/{setup.ts,chromeMock.ts}
├─ scripts/{gen-icons.mjs,e2e.mjs,package.mjs}
├─ vite.config.ts  tsconfig.json  package.json  vitest.config.ts
└─ dist/                      # 构建产物，Chrome「加载已解压的扩展程序」指向此处
```

---

## 9. 隐私与安全

1. 所有用户数据（书签、标签、设置、扫描结果、回收站、背景图）**仅存本地**：`chrome.storage.local` + 扩展自有 IndexedDB。无任何远程写入、无 analytics、无远程代码。
2. 唯一出站请求：① 用户主动触发的死链检测（目标即书签本身的 URL）；② 用户自定义背景图 URL；③ 用户主动执行的网页搜索（交给 Chrome 默认引擎）。设置页逐条明示。
3. `<all_urls>` 为**可选**权限，按需申请，可随时在设置中撤回（`chrome.permissions.remove`）。
4. CSP 严格：`script-src 'self'`，禁止 eval / 远程脚本；`style-src 'unsafe-inline'` 仅为 React 动态样式所需。
5. 用户输入（标题、URL、标签、背景 URL）一律经 React 文本渲染或 URL 校验，绝不 `innerHTML`；导入 HTML 用 `DOMParser` 白名单解析，丢弃脚本与事件属性，仅接受 `http/https` 链接。
6. 导出文件由 `Blob` + `URL.createObjectURL` 本地生成，不经过任何服务器。

---

## 10. 性能策略

| 场景 | 策略 |
|---|---|
| 万级书签展平/索引 | 分批 400 条 + 让出主线程；拼音结果按标题缓存 |
| 书签变更 | 事件 400ms 防抖后增量重建，避免每次点击都全量 |
| 长列表渲染 | `@tanstack/react-virtual` 虚拟滚动（管理台列表、首页大文件夹） |
| 搜索 | 纯字符串比较，无回溯正则；防抖 300ms；结果截断 |
| 死链扫描 | 并发池 + 同主机节流 + 缓存命中跳过 + 每 25 条落盘 |
| 首页渲染 | 分区懒挂载（IntersectionObserver），favicon 懒加载 |
| 存储 | 大对象走 IndexedDB，storage.local 只放设置 |

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| MV3 SW 空闲终止导致扫描中断 | 扫描只在页面上下文跑；进度落盘可续扫 |
| HEAD 被服务器拒绝（405/501） | 自动回退 GET |
| 403/429 被误判死链 | 单列 `blocked`，不进删除预览 |
| 未授予 host 权限时 fetch 拿不到状态 | 扫描前检测 `chrome.permissions.contains`，未授权则引导授权，不静默失败 |
| 新标签页接管无法运行时关闭 | 文档说明 + 首页可独立访问 + Chrome 原生提示可关闭 |
| favicon 端点在非扩展上下文不可用 | Demo 模式用首字母色块兜底 |
| 删除误操作 | 快照 + 回收站 + Toast 撤销三重保障 |
| 去重误合并（www / 跟踪参数） | 归一化规则可配 `ignoreWww`；标题相似只报告不自动删 |
| 导入 HTML 覆盖现有书签 | 强制导入到新建独立文件夹，先预览数量 |
| TS 7 生态不稳 | 锁定 TypeScript 5.9.x |

---

## 12. 验收标准

**功能**
- [ ] 首页只展示用户在文件夹选择器中勾选的原生文件夹，增删勾选后首页即时反映
- [ ] 首页页签可创建/改名/删除，各页签独立保存文件夹选择
- [ ] 地址栏输入 `bm zhihu` 出现书签优先建议，回车打开；`bm` + 生僻词最后一条为默认引擎网页搜索
- [ ] 首页/popup/管理台搜索：中文、拼音首字母（`zh` → 知乎）、URL 片段、标签均可命中；↑↓ 选择、Enter 打开、Ctrl+Enter 新标签、Esc 关闭
- [ ] 管理台可新建文件夹/书签、重命名、拖拽移动、批量删除，且 Chrome 原生书签栏同步变化
- [ ] 死链扫描：并发/超时/节流可配；404 判死、403 判 blocked、超时单列；可取消、可续扫
- [ ] 重复检测：同 URL（含跟踪参数差异）成组；同 host 高相似标题成组；保留项可改
- [ ] 空文件夹检测含嵌套；特殊文件夹永不出现在报告
- [ ] 所有删除经预览确认；Toast 撤销与回收站恢复均能还原到原位置
- [ ] 导出 HTML 可被 Chrome 原生书签管理器成功导入
- [ ] 亮/暗/跟随系统切换、强调色切换、背景切换即时生效并持久化

**质量**
- [ ] `npm run test` 全绿（URL 归一化、打分、并发池、去重、空文件夹、撤销、导出格式）
- [ ] `npm run build` 产出 `dist/`，Chrome 无警告加载
- [ ] Playwright + 真实 Chrome 加载 `dist/`：首页、搜索、管理、清理主流程无控制台错误
- [ ] 1280×800 与 1920×1080 视口无重叠/裁切/溢出；popup 360×560 正常
- [ ] 无未实现按钮、无 TODO、无空 handler

---

## 13. 变更记录

- **v1.1（2026-11-08）**：同步实现期行为变更——
  1. omnibox 自由文本回车走默认搜索引擎兜底，不再当 URL 打开（`9bab856`，§3.2 已同步）；
  2. 回收站删除/恢复语义补充：部分删除批次过滤、恢复 index 收敛（规避 Chrome "Index out of bounds"）、恢复中断补偿可重试（`9bab856`，§6.6 已同步）；
  3. `SearchResult` 新增可选 `query` 字段供 web 兜底结构化传递（`9bab856`，§4 已同步）；
  4. 目录结构补 `src/ui/download.ts`、`src/ui/popupStack.ts`（`9bab856` / `d31c8b5`，§8 已同步）。
  除上述条目外 v1.0 内容不变。§4 Settings 数据模型与 §8 组件清单为设计期快照，与实现的既有演化偏差统一记录在 [代码质量评估与优化方案.md](./代码质量评估与优化方案.md)，不在本规范内逐条展开。
- **v1.2（2026-11-09）**：同步第二轮优化（R0-R7）行为变更——
  1. 重复检测新增泛化/短标题守卫：泛化词表与归一化 <4 字符标题不参与跨站合并（`4590bf7`，§6.4 已同步）；
  2. omnibox 精化 scheme 白名单：可导航 scheme 打开、其余自由文本走搜索兜底（`46a65ab`，§3.2 精化 v1.1 表述）；
  3. `ScanReport` 新增可选 `checkedIds`：续扫跳过已检测 ok 项（`296cfb6`，§4/§6.3 已同步）；
  4. `Settings.dashboard.background` 新增可选 `revision`：换背景图即时生效（`3075030`，§4 已同步）；
  5. 首屏主题预设 `public/theme-boot.js`：三入口水合前同步应用主题（`332c48c`，§7.3/§8 已同步）；
  6. 目录结构补 `src/ui/openWithFeedback.ts`（`0e5e7e4`，§8 已同步）；Backend 接口新增 `openHub(focusSearch)`，UI 层 `chrome.*` 直调归零（同 commit）。