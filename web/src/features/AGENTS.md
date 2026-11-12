# AGENTS.md — web/src/features/ (前端功能模块层)

本目录是 27 个前端功能模块。每个模块是自包含的 feature slice（页面 + 组件 + 状态 + API）。跨模块的通用组件、hooks、工具在 `../components/`、`../hooks/`、`../lib/`。

**本文件只做导航。** 前端规范（i18n、组件复用、测试、样式、无障碍）以 `web/AGENTS.md` 为准，本文件不重复。

## 一、职责与入口

- 每个 feature 目录的标准结构：`index.tsx`（页面入口）、`api.ts`（请求封装）、`types.ts`（类型）、`constants.ts`（常量与文案键）、`components/`（feature 私有组件）、`lib/`（纯逻辑与工具）、`hooks/`（自定义 Hook）、`__tests__/`（测试）
- 页面路由在 `../routes/`（TanStack Router，`createFileRoute`）；路由树自动生成于 `../routeTree.gen.ts`，**不要手改**
- 通用业务组件在 `../components/`（`data-table/`、`dialog.tsx`、`confirm-dialog.tsx`、`copy-button.tsx`、`empty-state.tsx`、`loading-state.tsx`、`error-state.tsx`、`ui/`）

## 二、检索禁令（Do Not）

- **禁止遍历 `features/*/`**。27 个目录结构高度同构。只读你本次要改的那个 feature，不要为了「参考别处怎么做」批量打开其他 feature。
- **禁止在 feature 内重造通用能力**。通用弹窗、复制、空/加载/错误态、表格、分页、图标、日期选择等一律先查 `../components/`（`web/AGENTS.md` 3.3 有完整检索入口表）。仅使用 `Button` / `Dialog` 等基础组件**不等于**已复用对应的业务封装。
- **禁止手改 `../routeTree.gen.ts`**（自动生成）。
- **禁止在 feature 内写裸 `api.get` / `api.post`**。统一用 `../lib/api` 的 `api` 实例（`baseURL`、`withCredentials`、刷新与重试拦截器）。
- `../components/__tests__/`、`../features/*/__tests__/` 属测试，不要为了找实现而打开。
- 不要按语言遍历 `../i18n/locales/`（7 个大 JSON）。新增文案用 `t('English key')`，翻译维护用 `bun run i18n:sync`。

## 三、模式锚点

- **标准 feature 样板：`profile/`**。它具备完整的标准骨架（`api.ts` / `types.ts` / `constants.ts` / `components/` / `lib/` / `hooks/` / `__tests__/`），且当前 lint 零错误，是唯一同时满足「结构完整 + 干净」的样板。
  - 复制它的目录骨架：`api.ts` → `types.ts` → `constants.ts` → `components/` → `lib/` → `hooks/` → `__tests__/`
  - `api.ts` 样板见 `profile/api.ts`：统一 `import { api } from '@/lib/api'`，函数返回 `ApiResponse<T>`，敏感操作复用 `@/lib/secure-verification` 的 `authRequestOptions` / `authResult`
  - `hooks/index.ts` 是该 feature 的 Hook 出口
- **不要参考 `home/`、`pricing/`、`dashboard/` 作为样板**——这三个当前 lint error 数最高（16 / 17 / 10），会引入既有缺陷。

## 四、局部验证命令

仅针对本次改动的 feature，禁止全量构建：

```bash
cd web

# 类型检查（改动 TS/TSX 后必须执行；bun check 需 Bun >= 1.4.3，项目 packageManager 锁定 bun@1.4.4）
bun run typecheck

# 只 lint 本次改动的 feature（oxlint 退出码 0 = 该目录无 error）
bunx oxlint -c .oxlintrc.json src/features/<feature>

# 只跑本 feature 的测试
bunx vitest run src/features/<feature>

# 只检查本 feature 的格式（只读，不改文件）
bunx oxfmt -c .oxfmtrc.json --check src/features/<feature>
```

- `bun run lint` / `bun run format` 是**全项目**命令，本层不要用；本仓库当前已有若干 lint error 与格式偏差，全量运行会得到与本次改动无关的失败。
- **格式改写必须用项目脚本** `bun run format`（`scripts/format-with-protected-headers.mjs` 会先摘除再还原受保护的版权头）。**不要用 `oxfmt --write` 直接改写**——它不保护 `/* Copyright (C) ... QuantumNous */` 头。
- `bun check -b` 是 `bun check` 的 build 模式（对应 `tsc -b`）；本机 Bun 低于 1.4.3 时该命令不存在，会报 `Script not found "check"`，此时用项目锁定的 Bun 版本执行。

## 五、本层专属约束

- **用户可见文案必须走 i18n**：组件内 `const { t } = useTranslation()` 后 `t('English key')`；`constants.ts` 里的成功/错误消息常量只是 **i18n 键**，展示时仍须 `t(...)` 包裹，禁止直接当最终文案。
- **数字与金额格式化**：普通数字用 `@/lib/format` 的 `formatNumber` / `formatCompactNumber`，金额用 `@/lib/currency`；界面语言码（`zhCN` / `zhTW`）不是合法 Intl locale，进入 `Intl.*` 前必须经 `@/i18n/languages` 的 `toIntlLocale()` 转换。`bun run lint` 的 `project/intl-locale` 规则为 error，不得 disable 绕过。
- **复用优先**：新增组件前先检索 `../components/` 与相关 feature，确认无既有实现；确需新增时在变更说明中写明候选路径与不能复用的具体能力缺口。不同文案/尺寸/颜色不构成重复实现的理由。
- **测试**：feature 内测试放本 feature 的 `__tests__/` 目录，不得与正式代码平铺；文件名按被测职责命名（`layout.test.ts` / `selection.test.ts`）；断言用户可见行为与可访问属性，禁止断言内部 state 或整段 class 字符串快照；禁止固定 sleep 与无意义快照。
- 组件 props 非必要不要解构，直接用 `props.xxx`；类型只用时用 `import type { X }`（`no-import-type-side-effects` 为 lint error）。
