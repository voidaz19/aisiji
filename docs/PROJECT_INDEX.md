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
| Markdown 语法树预览与格式命令 | src/components/markdown/ | src/components/markdown/*.test.ts |
| 统一输入菜单与附件插入流程 | src/components/EditorCommandMenu.tsx、src/components/InlineEditor.tsx、src/components/attachmentInsertion.ts、src/components/attachmentUploadState.ts、src/components/markdown/markdownCommands.ts、src/store/useNotebookStore.ts | src/components/EditorCommandMenu.test.ts、src/components/InlineEditor.test.tsx、src/components/attachmentInsertion.test.ts、src/components/markdown/markdownCommands.test.ts、src/store/useNotebookStore.test.ts |
| Windows/Tauri 原生路径拖放与附件导入 | src/platform/nativeAttachments.ts、src/platform/attachments.ts、src/components/InlineEditor.tsx、src-tauri/tauri.conf.json、src-tauri/src/attachments.rs | src/components/InlineEditor.test.tsx、src/store/useNotebookStore.test.ts、Tauri 配置 schema |
| 外链安全打开、附件预览与本机折叠偏好 | src/platform/externalNavigation.ts、src/components/markdown/markdownInteractions.ts、src/components/markdown/attachmentPreview.ts、src/components/markdown/attachmentPreviewPreferences.ts、src/components/markdown/markdownEditorContext.ts、src/components/markdown/markdownWidgets.ts | src/platform/externalNavigation.test.ts、src/components/markdown/attachmentPreview.test.ts、src/components/markdown/attachmentPreviewPreferences.test.ts、src/components/markdown/markdownDecorations.test.ts |
| 节点链接标题补全 | src/components/markdown/nodeLinkCompletion.ts、src/components/markdown/markdownEditor.ts | src/components/markdown/markdownLanguage.test.ts |
| Markdown 可见光标与删除语义 | src/components/markdown/markdownDecorations.ts、src/components/markdown/markdownVisibleEditing.ts、src/components/editorNavigation.ts | src/components/markdown/markdownDecorations.test.ts、src/components/InlineEditor.test.tsx |
| 真实节点/临时草稿统一编辑目标与结构预检 | src/components/editorTarget.ts、src/components/GhostEditor.tsx、src/components/InlineEditor.tsx、src/domain/commands/moveNode.ts | src/components/editorTarget.test.ts、src/components/GhostEditor.test.tsx、src/domain/commands/nodeCommands.test.ts、src/features/notebook/NotebookPanel.test.tsx |
| 树布局 FLIP 与占位行变化 | src/features/notebook/hooks/useTreeLayoutAnimation.ts | src/features/notebook/NotebookPanel.test.tsx |
| 文本到节点的渐进范围选择 | src/features/notebook/hooks/useNodeRangeSelection.ts | src/features/notebook/NotebookPanel.test.tsx、docs/编辑规范.md |
| 最近编辑页面上下文与聚合 | src/domain/recentPages.ts、src/store/useNotebookStore.ts、src/features/dashboard/DashboardPanel.tsx | src/domain/recentPages.test.ts、src/features/dashboard/DashboardPanel.test.tsx、src/store/useNotebookStore.test.ts |
| 树块空白坐标命中 | src/components/treeHitTesting.ts | src/components/treeHitTesting.test.ts |
| 页面级连续可编辑画布落点 | src/features/notebook/NotebookPanel.tsx、src/App.css | src/features/notebook/NotebookPanel.test.tsx |
| 大列表窗口化和交互兼容 | src/features/notebook/NotebookPanel.tsx | src/features/notebook/NotebookPanel.test.tsx |
| 节点与视图根层级线 | src/features/notebook/hooks/useHierarchyGuides.ts | src/features/notebook/NotebookPanel.test.tsx、src/features/notebook/model/hierarchyGuideLayout.test.ts |

## 验证入口

- 完整检查：`npm run check`
- 模块边界：`npm run check:boundaries`
- 前端测试：`npm test`
- 生产构建：`npm run build`
- Rust 格式：`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- Rust 编译：`cargo check --manifest-path src-tauri/Cargo.toml`
