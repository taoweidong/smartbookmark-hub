# SmartBookmark Hub

书签优先的全局搜索、可视化首页与书签智能治理 —— 一个完全本地化的 Chrome 扩展（Manifest V3）。

> 在**完全保留 Chrome 原生收藏夹**的前提下，提供「可视化首页 + 书签优先的全局搜索 + 已有书签的批量治理」三件能力。所有数据仅保存在本机，绝不上传服务器。

## 功能

- **可视化首页**（接管新标签页）：按用户勾选的原生文件夹分区展示书签卡片，支持多页签（工作/学习/娱乐）、网格/列表布局、卡片尺寸、亮暗主题、强调色与自定义背景。
- **书签优先的全局搜索**：三处入口（地址栏 `bm` 关键字、页面内搜索框、popup 快捷搜索）共用同一引擎，排序恒定「书签 > 历史 > 网页」；支持中文、拼音首字母（`zh` → 知乎）、全拼、URL 片段与标签模糊匹配；↑↓ 选择、Enter 打开、Ctrl+Enter 新标签、Esc 关闭。
- **书签管理台**（options 页）：树形浏览、新建/重命名/拖拽移动、批量选择删除、标签管理、链接健康度筛选，改动实时同步到 Chrome 原生书签栏。
- **智能清理**：死链检测（可配并发/超时/同域名节流，HEAD→GET 回退，403/429/503 单列为「访问受限」绝不误删）、重复书签合并（URL 归一化 + 标题 bigram Dice 相似度）、空文件夹清理（含嵌套）。全部经「预览 → 确认 → 回收站 → 撤销」链路。
- **备份**：标准 Netscape HTML 导出（可被 Chrome 原生导入）、HTML 导入（白名单解析，强制导入到独立文件夹）、JSON 全量备份。

## 快速开始

```bash
npm install
npm run build        # 产物输出到 dist/
```

Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist` 目录。

### 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite 开发服务器（网页预览模式，使用内置示例书签） |
| `npm run build` | 构建可加载的扩展产物到 `dist/` |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest 单元/组件测试 |
| `npm run e2e` | Playwright + 真实 Chromium 端到端验证（需先 `npx playwright install chromium`） |
| `npm run package` | 打包 `dist/` 为 zip |
| `npm run icons` | 重新生成品牌图标 |

## 架构

三层分离：React 页面层只调用 `src/core`；core 为纯 TypeScript（无 DOM/React 依赖，可在 Service Worker、页面与 Node 测试中运行）；所有 `chrome.*` 调用集中在 `src/core/backend.ts`（真实 ChromeBackend / 无 API 时自动降级 DemoBackend）。设置存 `chrome.storage.local`，大对象（健康缓存、扫描报告、回收站）存 IndexedDB。

```
src/
├─ background/   Service Worker：omnibox、快捷键、右键菜单、事件广播
├─ core/         纯逻辑：搜索、URL 归一化、拼音、并发池、清理、回收站、备份
│  └─ cleaner/   死链探测 / 去重 / 空文件夹 / 扫描编排（断点续扫）
├─ pages/        newtab（首页）、popup（快捷搜索）、options（管理台）
└─ ui/           组件、hooks 与「墨与鎏金」视觉令牌
```

详细设计见 [docs/SmartBookmark-Hub-技术方案.md](docs/SmartBookmark-Hub-技术方案.md)，任务分解见 [docs/实施计划.md](docs/实施计划.md)。

## 隐私

- 书签、标签、设置、扫描结果、回收站全部仅存本机（`chrome.storage.local` + 扩展自有 IndexedDB）。
- 无 analytics、无远程代码、无远程字体。
- 唯一的网络请求：用户主动触发的死链检测（目标即书签自身 URL，需按需授予站点访问权限，可随时撤回）、自定义背景图、用户主动执行的网页搜索（交给浏览器默认引擎）。

## 许可

MIT
