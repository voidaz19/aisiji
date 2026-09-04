# 项目结构与 SPEC 索引

本文件用于帮助后续开发者快速定位模块职责、行为规范与验证入口。实际依赖规则以仓库根目录的 `AGENTS.md` 为准。

## 项目结构

```text
src/
  app/          应用装配、导航和生命周期
  features/     按用户功能组织的页面、Hook 与视图模型
  components/   跨功能复用的编辑器和树行组件
  domain/       纯业务模型、树规则和命令
  store/        Zustand 状态编排和操作日志
  sync/         同步协议与传输接口
  platform/     浏览器/Tauri 平台适配器
  shared/       轻量公共类型与工具

src-tauri/src/
  lib.rs          Tauri 命令注册
  database.rs     SQLite 工作区、操作日志、事务批处理和数据库维护
  attachments.rs  附件存储、哈希与安全删除
  credentials.rs  系统密钥环
  webdav.rs       WebDAV 传输
```

## SPEC 与维护文档

| 文档 | 内容 | 变更时机 |
| --- | --- | --- |
| `AGENTS.md` | 沟通、依赖边界、开发约定和完成标准 | 项目协作规则变化时 |
| `docs/ARCHITECTURE.md` | 模块边界和依赖方向 | 架构或目录职责变化时 |
| `docs/DOMAIN_RULES.md` | 节点身份、树操作、删除与恢复语义 | 业务行为变化前先确认 |
| `docs/SYNC_PROTOCOL.md` | 操作日志和同步协议 | 同步格式或合并规则变化时 |
| `docs/编辑规范.md` | 编辑器交互约定 | 输入、快捷键或 Markdown 行为变化时 |
| `docs/MARKDOWN_SPEC.md` | Markdown 支持边界、Live Preview 与格式快捷键 | Markdown 语法或渲染行为变化时 |
| `docs/PERFORMANCE.md` | 性能夹具、采样规则、回归预算、结果格式与平台覆盖边界 | 性能场景、指标、预算或执行环境变化时 |
| `docs/PERFORMANCE_AUDIT_2026-08-02.md` | 输入、渲染、Live Preview、虚拟化和持久化路线的性能架构审查 | 重大性能架构施工前复核；结论被新基线推翻时更新 |
| `docs/PERSISTENCE_SPEC.md` | SQLite/IndexedDB 增量实体、事务、操作合并，以及不读取旧数据的开发期 schema 重建边界 | 持久化模型、Repository 契约或数据初始化策略变化前 |
| `docs/CANVAS_SUPERTAG_SPEC.md` | Canvas 内建 supertag、自动网格视图和明确非目标 | Canvas 交互、数据模型或同步语义变化前 |
| `docs/GITHUB_RELEASE.md` | GitHub Releases 的 Windows 安装包发布前提、版本规则和验收流程 | 更换发布渠道、发布平台或版本策略时 |
| `docs/DEVELOPMENT_LOG.md` | 每轮施工范围、决策与验证结果 | 每次修改代码或项目文档时 |
| `README.md` | 面向使用者的项目能力和运行说明 | 用户确认本轮工作有效后 |

## 性能与维护索引

| 能力 | 主要实现 | 回归入口 |
| --- | --- | --- |
| 页面前进/后退导航历史 | src/app/navigationHistory.ts、src/app/AppShell.tsx、src/app/components/TopBar.tsx | src/app/navigationHistory.test.ts、src/app/AppShell.test.tsx、src/app/components/TopBar.test.tsx |
| 父子节点索引与可见树展开 | src/domain/tree.ts | src/domain/tree.test.ts |
| 拖拽槽位索引复用 | src/domain/dropSlots.ts | src/domain/dropSlots.test.ts |
| 永久清理软删除数据 | src/domain/purgeDeletedNodes.ts | src/domain/purgeDeletedNodes.test.ts |
| 原生批量持久化与强制落盘 | src/platform/workspaceRepository.ts | src/platform/workspaceRepository.test.ts |
| SQLite 文本日志压缩与 VACUUM | src-tauri/src/database.rs | cargo check 与桌面端维护入口 |
| 附件引用保留与物理删除 | src/domain/purgeDeletedNodes.ts、src-tauri/src/attachments.rs | src/domain/purgeDeletedNodes.test.ts |
| CodeMirror 近视口挂载 | src/components/InlineEditor.tsx | src/components/InlineEditor.test.tsx |
| Markdown 语法树预览、视口有界装饰与格式命令 | src/components/markdown/markdownDecorations.ts、src/components/markdown/ | src/components/markdown/markdownDecorations.test.ts、src/components/markdown/*.test.ts、performance/browser.perf.spec.ts |
| 统一输入菜单、虚实编辑器交接与附件插入流程 | src/components/editorTarget.ts、src/components/EditorCommandMenu.tsx、src/components/GhostEditor.tsx、src/components/InlineEditor.tsx、src/components/attachmentInsertion.ts、src/components/attachmentUploadState.ts、src/components/markdown/markdownCommands.ts、src/store/useNotebookStore.ts | src/components/editorTarget.test.ts、src/components/EditorCommandMenu.test.ts、src/components/GhostEditor.test.tsx、src/components/InlineEditor.test.tsx、src/components/attachmentInsertion.test.ts、src/components/markdown/markdownCommands.test.ts、src/store/useNotebookStore.test.ts、docs/编辑规范.md |
| 节点与行内文本选区浮动菜单 | src/components/SelectionMenu.tsx、src/components/InlineEditor.tsx、src/features/notebook/NotebookPanel.tsx、src/features/notebook/hooks/useNodeRangeSelection.ts、src/platform/clipboard.ts | src/components/SelectionMenu.test.tsx、src/components/InlineEditor.test.tsx、src/features/notebook/NotebookPanel.test.tsx |
| Windows/Tauri 原生路径拖放与附件导入 | src/platform/nativeAttachments.ts、src/platform/attachments.ts、src/components/InlineEditor.tsx、src-tauri/tauri.conf.json、src-tauri/src/attachments.rs | src/components/InlineEditor.test.tsx、src/store/useNotebookStore.test.ts、Tauri 配置 schema |
| 外链安全打开、附件预览与本机折叠偏好 | src/platform/externalNavigation.ts、src/components/markdown/markdownInteractions.ts、src/components/markdown/attachmentPreview.ts、src/components/markdown/attachmentPreviewPreferences.ts、src/components/markdown/markdownEditorContext.ts、src/components/markdown/markdownWidgets.ts | src/platform/externalNavigation.test.ts、src/components/markdown/attachmentPreview.test.ts、src/components/markdown/attachmentPreviewPreferences.test.ts、src/components/markdown/markdownDecorations.test.ts |
| 滚动条点击区域隔离 | src/components/scrollbarHitTesting.ts、src/features/notebook/NotebookPanel.tsx、src/features/notebook/hooks/useNodeRangeSelection.ts | src/components/scrollbarHitTesting.test.ts |
| 节点链接标题补全 | src/components/markdown/nodeLinkCompletion.ts、src/components/markdown/markdownEditor.ts | src/components/markdown/markdownLanguage.test.ts |
| Markdown 可见光标与删除语义 | src/components/markdown/markdownDecorations.ts、src/components/markdown/markdownVisibleEditing.ts、src/components/editorNavigation.ts | src/components/markdown/markdownDecorations.test.ts、src/components/InlineEditor.test.tsx |
| 真实节点/临时草稿统一编辑目标与结构预检 | src/components/editorTarget.ts、src/components/GhostEditor.tsx、src/components/InlineEditor.tsx、src/domain/commands/moveNode.ts | src/components/editorTarget.test.ts、src/components/GhostEditor.test.tsx、src/domain/commands/nodeCommands.test.ts、src/features/notebook/NotebookPanel.test.tsx |
| Tana 风格节点选区批量缩进 | src/domain/commands/moveNode.ts、src/domain/nodeSelection.ts、src/store/useNotebookStore.ts、src/features/notebook/hooks/useNodeRangeSelection.ts | src/domain/commands/nodeCommands.test.ts、src/features/notebook/NotebookPanel.test.tsx、docs/DOMAIN_RULES.md、docs/编辑规范.md |
| 树布局 FLIP、占位行与附件异步尺寸变化 | src/features/notebook/hooks/useTreeLayoutAnimation.ts | src/features/notebook/hooks/useTreeLayoutAnimation.test.tsx、src/features/notebook/NotebookPanel.test.tsx |
| 文本到节点的渐进范围选择 | src/features/notebook/hooks/useNodeRangeSelection.ts | src/features/notebook/NotebookPanel.test.tsx、docs/编辑规范.md |
| 最近编辑页面上下文与聚合 | src/domain/recentPages.ts、src/store/useNotebookStore.ts、src/features/dashboard/DashboardPanel.tsx | src/domain/recentPages.test.ts、src/features/dashboard/DashboardPanel.test.tsx、src/store/useNotebookStore.test.ts |
| 树块空白坐标命中 | src/components/treeHitTesting.ts | src/components/treeHitTesting.test.ts |
| 页面级连续可编辑画布落点 | src/features/notebook/NotebookPanel.tsx、src/App.css | src/features/notebook/NotebookPanel.test.tsx |
| 中/大列表窗口化、线性拖拽槽位/子树测量、节点范围选择派生计算和交互兼容 | src/features/notebook/NotebookPanel.tsx、src/features/notebook/hooks/useNodeRangeSelection.ts、src/domain/dropSlots.ts、src/features/notebook/model/subtreeLayout.ts | src/domain/dropSlots.test.ts、src/features/notebook/model/subtreeLayout.test.ts、src/features/notebook/NotebookPanel.test.tsx、performance/domain.perf.test.ts、performance/browser.perf.spec.ts、performance/budgets.ts |
| 自动化性能基线、输入/Live Preview 分段探针与回归预算 | performance/fixtures.ts、performance/budgets.ts、performance/metrics.ts、src/shared/performanceProbe.ts、playwright.performance.config.ts、vitest.performance.config.ts | performance/domain.perf.test.ts、performance/browser.perf.spec.ts、docs/PERFORMANCE.md、`npm run test:perf` |
| 性能架构审查与重做边界 | docs/PERFORMANCE_AUDIT_2026-08-02.md | 重大性能施工前按审查顺序补齐分项基线并重新确认 |
| 增量持久化目标架构 | docs/PERSISTENCE_SPEC.md、docs/ARCHITECTURE.md | 实施前冻结待确认决策；实施后由 Repository 合同、schema 重建与性能测试接替 |
| 节点与视图根层级线 | src/features/notebook/hooks/useHierarchyGuides.ts | src/features/notebook/NotebookPanel.test.tsx、src/features/notebook/model/hierarchyGuideLayout.test.ts |
| 节点子树拖拽预览、相对层级、层级线跟随/透明度与 Markdown Live Preview | src/features/notebook/DragPreview.tsx、src/features/notebook/dragPreviewLayout.ts、src/features/notebook/model/dragPreview.ts、src/features/notebook/NotebookPanel.tsx | src/features/notebook/DragPreview.test.tsx、src/features/notebook/dragPreviewLayout.test.ts、src/features/notebook/model/dragPreview.test.ts |
| 设置页调试样例工作区生成 | src/features/settings/SettingsPanel.tsx、src/domain/debugSamples.ts、src/store/useNotebookStore.ts | src/features/settings/SettingsPanel.test.tsx、src/domain/debugSamples.test.ts、src/store/useNotebookStore.test.ts |
| 卡片视图（Canvas）supertag 根视图、树内局部网格与 `#` 补全入口 | src/domain/supertags.ts、src/components/markdown/supertagCompletion.ts、src/features/canvas/CanvasPanel.tsx、src/features/canvas/CanvasCardGrid.tsx、src/features/notebook/model/treeLayoutRows.ts、src/store/useNotebookStore.ts | src/domain/supertags.test.ts、src/components/markdown/markdownLanguage.test.ts、src/features/canvas/CanvasPanel.test.tsx、src/features/notebook/model/treeLayoutRows.test.ts、src/features/notebook/NotebookPanel.test.tsx、docs/CANVAS_SUPERTAG_SPEC.md |
| Windows NSIS 正式安装包 | src-tauri/tauri.conf.json、src-tauri/icons/icon.ico | `npm run tauri build`、src-tauri/target/release/bundle/nsis/ |
| GitHub Windows 自动发布 | .github/workflows/release-windows.yml、docs/GITHUB_RELEASE.md | 推送匹配版本的 `v*` 标签，检查 GitHub Actions 与 Releases |

## 验证入口

- 完整检查：`npm run check`
- 模块边界：`npm run check:boundaries`
- 前端测试：`npm test`
- 性能测试类型检查：`npm run check:perf-types`
- 完整性能回归：`npm run test:perf`
- 生产构建：`npm run build`
- Rust 格式：`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- Rust 编译：`cargo check --manifest-path src-tauri/Cargo.toml`
