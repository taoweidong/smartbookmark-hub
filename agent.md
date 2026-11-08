# SmartBookmark Hub · AI 协作规范

> 本文件对所有在本仓库工作的 AI 代理与会话生效。人类协作者同样建议遵守。

## 1. 测试门禁（强制，无例外）

**每一次 AI 交互都必须执行前端与后端的单元测试，全部通过后才允许提交代码。**

- **前端测试**：`src/ui/**` 与 `src/pages/**` 下的 `*.test.tsx`（组件、hook、页面交互）。
- **后端测试**：`src/core/**` 与 `src/background/**` 下的 `*.test.ts`（纯逻辑、backend 适配、service worker）。
- 两者由同一条命令一并运行，**不允许只跑其中一侧**：

```bash
npm run typecheck   # TypeScript 必须零错误
npm run test        # 前端 + 后端全部单元/组件测试，必须 100% 通过
```

门禁判定：

1. **测试未通过时严禁提交**（`git commit` 一律不得执行）。必须先定位失败根因、修复问题，再**重新运行上述两条命令**验证全绿，然后才允许提交。
2. 即使本次交互只改文档、配置或脚本，也必须在结束前跑一遍完整测试确认仓库处于全绿状态。
3. 不允许通过跳过测试（`it.skip`、`it.todo`、`--bail`、注释用例、放宽或删除断言）来让门禁通过。
4. 不允许把失败归因为「环境问题/偶发」而不复现就提交；flaky 用例必须修到可稳定重复执行。
5. 修复缺陷时，必须先写一个**能复现该缺陷的失败测试**，再修复源码使测试转绿（红→绿，回归保护）。
6. 提交前在回复中报告实际测试数字（文件数/用例数）与 typecheck 结果，不得只声称「已通过」。

## 2. 提交规范

- 提交信息使用中文前缀：`feat: ` / `fix: ` / `test: ` / `chore: ` / `docs: ` / `perf: ` / `refactor: `。
- 一个逻辑变更一个提交；行为修复与大规模重构不混在同一提交，保证可单独回滚。
- 涉及页面主流程（首页/搜索/管理台/清理/备份）的改动，需在本地额外运行 `npm run build` 与 `npm run e2e`（真实 Chromium，37 项断言）确认后再提交。
- 提交前检查 `git status`，不提交无关文件；`dist/`、`test-results/`、`node_modules/` 永不入库。

## 3. 测试质量要求

- 测试必须**可稳定重复执行**：相互无依赖、不依赖执行顺序、不依赖真实网络与真实时间（需要时间语义时用 fake timers / 注入 `now`）。
- 每个测试自行准备数据与清理（项目已在 `src/test/setup.ts` 统一重置 backend/cache/store）。
- 覆盖目标：核心业务逻辑、接口输入输出、异常分支与边界条件（空集合、非法输入、越界、失败路径），而不仅是 happy path。
- 新增或修改 core 模块时同步补充/更新对应 `*.test.ts`；新增组件/hook 时同步补充 `*.test.tsx`。

## 4. 架构约束（与 docs/SmartBookmark-Hub-技术方案.md 一致）

- `src/core/**` 禁止 import React、禁止直接引用 `document/window`（`yieldToBrowser` 的能力检测除外）。
- 所有 `chrome.*` 调用只允许出现在 `src/core/backend.ts`、`src/core/chromeBackend.ts` 与 `src/background/**`；core 其余位置仅允许只读能力检测（如 `src/core/url.ts` 的 `faviconUrl` 读取 `chrome.runtime.id`），不得调用任何 `chrome.*` API。
- 页面层只调用 core 暴露的 service/store，不得绕过适配层。
- 删除类操作必须走「快照 → 回收站 → 确认」链路；`blocked/error/timeout` 检测结果绝不进入删除预览。
- 搜索排序恒定：书签 > 历史（score ≤ 40）> 网页（score = -1）。

## 5. 已知维护约定

- README 徽章中的测试数量、本文档与 `docs/代码质量评估与优化方案.md`（v1.0）、`docs/代码质量评估与优化方案-v2.md`（v2.0，当前推进中）中的统计数字，在用例数变化时需同步更新。
- 公共小工具优先复用：格式化用 `core/format.ts`，颜色用 `ui/folderHue.ts`，避免第三份实现。
