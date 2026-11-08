# SmartBookmark Hub · AI 协作规范

> 本文件对所有在本仓库工作的 AI 代理与会话生效。人类协作者同样建议遵守。

## 1. 测试门禁（强制）

**每一次 AI 交互中，凡涉及代码改动（新增/修改/删除源码、配置、脚本），必须在交互结束前执行完整测试并全部通过，才允许提交代码：**

```bash
npm run typecheck   # TypeScript 必须零错误
npm run test        # 前端与后端（core）单元/组件测试必须全部通过
```

- **测试未通过时严禁提交**：先定位并修复问题，重新运行上述命令验证全绿后，才可执行 `git commit`。
- 不允许通过跳过测试（`it.skip`、`--bail`、注释用例、放宽断言）来让门禁通过。
- 修复缺陷时，必须先写一个能复现该缺陷的失败测试，再修复源码使测试转绿（回归保护）。

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
- 所有 `chrome.*` 调用只允许出现在 `src/core/backend.ts`、`src/core/chromeBackend.ts` 与 `src/background/**`。
- 页面层只调用 core 暴露的 service/store，不得绕过适配层。
- 删除类操作必须走「快照 → 回收站 → 确认」链路；`blocked/error/timeout` 检测结果绝不进入删除预览。
- 搜索排序恒定：书签 > 历史（score ≤ 40）> 网页（score = -1）。

## 5. 已知维护约定

- README 徽章中的测试数量、本文档与 `docs/代码质量评估与优化方案.md` 中的统计数字，在用例数变化时需同步更新。
- 公共小工具优先复用：格式化用 `core/format.ts`，颜色用 `ui/folderHue.ts`，避免第三份实现。
