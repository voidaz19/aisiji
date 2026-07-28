# 开发施工日志

## 2026-07-28：补齐节点与树块间空白的鼠标命中区

### 问题与原因

- 节点行之间、子树内部和子树结束处的视觉间距由 `margin-bottom` 形成，不属于任何树行元素。
- 鼠标位于这些空白时，悬停状态无法归属节点，范围选择的 `elementFromPoint` 也只能命中树容器，导致选区拖动中断或无法从空白处开始。

### 修改

- `src/components/treeHitTesting.ts`：新增按树块实际矩形及其布局间距进行坐标命中的共享规则。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：空白处按坐标回退到最近树块，范围选择跨越任意空白不再中断。
- `src/features/notebook/NotebookPanel.tsx`：树列表空白点击按同一规则聚焦节点、聚焦新建行或进入日期。
- `src/components/treeHitTesting.test.ts`：覆盖布局间距归属测试。
- 删除上一版透明间距延伸层及其专属样式，避免维护两套命中机制。
- `src/features/notebook/NotebookPanel.test.tsx`：改为直接验证树列表空白坐标点击会路由到最近普通节点或新建行。
- 拖拽排序仍沿用现有语义插槽命中区，插入线位置和节点拖拽手柄不变。

### 验证

- 待运行定向测试、完整 `npm run check` 和本地预览鼠标命中核验。
- 用户实际数据复测：待确认节点间、子树间较大空白均可连续命中。
- README 暂不更新，待用户确认本轮有效无误后再更新。

## 2026-07-28：统一日期根与普通根标题宽度

### 问题与原因

- 日期根标题使用块级 `h1` 占满标题区，普通节点根标题则额外扣除了树行左侧留白、折叠控件和右侧留白，因此两类根标题的可用宽度不一致。

### 修改

- `src/features/notebook/NotebookPanel.tsx`：日期根与普通节点根统一使用 `view-root-heading` 标题宽度契约。
- `src/App.css`：根标题统一占满标题区；移除普通节点根额外的宽度扣减和左侧偏移。
- `src/features/notebook/NotebookPanel.test.tsx`：新增日期根与普通节点根共享宽度契约的回归测试。

### 验证

- 定向 `NotebookPanel` 测试通过（1 个测试文件、14 条测试）。
- 完整 `npm run check` 通过（模块边界、24 个测试文件/135 条测试、生产构建、Rust 格式和 Rust 编译）。
- 桌面预览实测：日期根与普通节点根标题均为 860px，左右边界与标题容器完全重合。
- 响应式宽度由同一 `width: 100%` 契约控制；应用内浏览器的移动视口覆盖未实际生效，真实窄屏仍待用户复测。
- 用户实际数据复测：待确认日期根与普通节点根的标题左右边界一致。
- README 暂不更新，待用户确认本轮有效无误后再更新。

## 2026-07-28：补齐视图根节点层级线

### 问题与范围

- “所有笔记”、今天日期以及进入后的具体笔记都作为当前视图根显示在树列表标题区。
- 现有层级线只扫描树列表内部的真实父节点，因此这些视图根虽然有可见子节点，也不会生成根级层级线。

### 修改

- `src/features/notebook/hooks/useHierarchyGuides.ts`：把当前视图根作为深度 `-1` 的隐式父节点，根据首个顶层子行的锚点和整棵可见子树的末端生成根级层级线；仅有“新建子节点”占位行的空根也保留该层级线。
- `src/features/notebook/NotebookPanel.tsx`：向层级线 Hook 传入当前 `rootId`；搜索和回收站仍不显示可交互层级线。
- 根级线沿用现有点击/键盘交互，调用 `toggleChildren(rootId)` 统一折叠或展开根的下一级可展开节点。
- `src/features/notebook/NotebookPanel.test.tsx`：新增全局根层级线的渲染与锚点回归测试。

### 验证

- 定向层级线测试通过（2 个测试文件、16 条测试）。
- 完整 `npm run check` 通过（模块边界、24 个测试文件/134 条测试、生产构建、Rust 格式和 Rust 编译）。
- 本地预览实测：所有笔记根级线可见并延伸 92px；进入仅有“新建节点”占位行的普通笔记后，根级线仍可见并延伸 28px。
- 用户实际数据复测：待确认所有笔记、今天和进入笔记后的根级层级线位置与交互。
- README 暂不更新，待用户确认本轮有效无误后再更新。

## 2026-07-28：笔记切换内容闪烁修复

### 问题与原因

- 切换到“所有笔记”或进入其他笔记时，节点内容偶尔会短暂闪烁。
- CodeMirror 原先在普通 `useEffect` 中创建和同步内容；浏览器可以先绘制一帧空编辑器容器，再挂载真实编辑器。
- 通过进入节点或面包屑改变 `activeRootId` 时，常驻的笔记面板也在普通 `useEffect` 中同步根 ID，可能先绘制一帧旧根节点。

### 修改

- `src/components/InlineEditor.tsx`：编辑器创建、外部内容同步和激活焦点同步改用 `useLayoutEffect`，保证在绘制前完成。
- `src/app/AppShell.tsx`：Store 根节点到常驻笔记面板根 ID 的兜底同步改用 `useLayoutEffect`，避免旧内容帧。
- 不改变节点数据、导航语义、虚拟列表阈值或持久化协议，属于局部渲染时序修复。

### 验证

- 待运行定向测试与完整 `npm run check`。
- 用户实际数据复测：待用户确认“今天 / 所有笔记 / 进入节点 / 面包屑返回”切换时不再闪烁。
- README 暂不更新，待用户确认本轮修复有效无误后再更新。

## 2026-07-27：性能优化第一阶段

### 背景与基线

- 用户反馈编辑、拖拽和页面切换均出现明显卡顿。
- 只读诊断时本机工作区共 545 个节点，其中 37 个有效节点、508 个软删除节点；SQLite 操作日志 5965 条。
- 原实现每次字符编辑都会同步写浏览器快照，并分别调用原生全量快照保存和单条操作日志写入。
- 节点内容变化会使整树行订阅失效，并触发布局动画、层级线和选区覆盖层重新测量。
- 拖拽移动期间会重复扫描所有 DOM 行，同一次指针移动可由全局监听器与 dnd-kit 回调重复计算。

### 本轮范围

1. 保留浏览器同步快照，保证最新文本有本地恢复副本。
2. 将 Tauri 工作区快照和操作日志改为 180ms 窗口内的事务批处理。
3. 启动恢复时比较浏览器与原生快照，防止原生批处理延迟导致旧快照覆盖新内容。
4. 收窄 App、笔记面板、主页和节点行的 Zustand 订阅。
5. 节点行按节点 revision 和结构属性建立 memo 边界；树布局一次构建子节点计数。
6. 普通文字变化不再重建整树布局测量监听，仅结构签名变化时重测。
7. 拖拽布局在拖拽期间缓存，指针更新限制为每动画帧一次；非调试模式跳过调试命中区状态。

### 关键决策

- 第一阶段暂不清理软删除节点或压缩历史操作日志，避免改变数据保留与同步语义；这些属于第二阶段。
- 第一阶段暂不启用虚拟列表，避免同时改变可变高度 CodeMirror 行、跨节点选择和拖拽语义；这些属于第三阶段。
- 浏览器 `localStorage` 仍同步保存；批处理只作用于原生 SQLite，优先保证崩溃恢复安全。
- 原生批处理失败时保留队列并延迟重试，批次之间串行执行，避免旧快照晚于新快照落库。

### 涉及模块

- `src/platform/workspaceRepository.ts`
- `src/store/useNotebookStore.ts`
- `src/domain/notebookState.ts`
- `src/app/AppShell.tsx`
- `src/features/dashboard/DashboardPanel.tsx`
- `src/features/notebook/NotebookPanel.tsx`
- `src/features/notebook/model/treeLayoutRows.ts`
- `src/components/TreeRow.tsx`
- `src/components/treeBlock.ts`
- `src-tauri/src/database.rs`
- `src-tauri/src/lib.rs`

### 测试与验证

- 新增浏览器/原生快照新旧选择测试。
- 新增连续提交合并为单次原生事务批处理测试。
- 完整 `npm run check`：通过（模块边界、22 个测试文件/119 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户实际数据手动体验：待用户确认。

### 2026-07-28 用户复测跟进

- 用户确认第一版对页面切换没有明显改善，因此本阶段不视为验收完成，README 继续保持不变。
- 实机观察显示今天页同时挂载约 11 个 CodeMirror；原条件渲染在离开笔记页时会销毁整组编辑器，返回时全部重建。
- 调整 AppShell，使笔记面板在主页和设置页期间保持挂载；今天与所有笔记切换时复用相同 key 的节点编辑器。
- 回收站行改为只读文本，并在拖拽禁用页面跳过 `useSortable`，避免为大量软删除节点创建 CodeMirror 和拖拽订阅。
- 首版保持挂载容器遗漏 flex 约束，曾造成页面无法滚动并压缩顶部拖拽栏；已增加 `.notebook-host` 的 flex/overflow 约束，并固定 `.topbar` 为 40px 不收缩。
- 新增 AppShell 生命周期回归测试，覆盖主页往返时编辑器实例不被销毁，以及进入节点后保留面板根 ID 与 Store 同步。
- 新增回收站轻量渲染测试，保证删除节点不会挂载 CodeMirror。
- 修复 `.notebook-host` 的 flex 显示覆盖原生 `hidden` 样式，显式使用 `.notebook-host[hidden] { display: none; }`，避免主页出现笔记区域。
- 修复顶部中间拖拽区被整块 `.breadcrumbs` 标记为 `no-drag` 的问题；现在仅按钮、链接和输入框禁用拖拽，中间文字与空白保持可拖动。
- 完整 `npm run check`：通过（模块边界、23 个测试文件/121 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户实际数据复测：待用户确认滚动、拖拽栏与切页体感。

## 2026-07-28：性能优化第二、第三阶段

### 背景与范围

- 实际工作区基线为 545 个节点，其中 37 个有效节点、508 个软删除节点；SQLite 操作日志 5965 条，其中 update_markdown 3616 条。
- 第二阶段治理反复全表扫描、软删除数据增长、附件生命周期和 SQLite 文本日志膨胀。
- 第三阶段降低大型工作区同时挂载的树行和 CodeMirror 数量，并建立 1,000/10,000 节点回归基线。
- 用户明确要求不要为了验证主动进入回收站；维护入口因此放在设置页，可直接看到待清理节点数量。

### 数据查询与性能基线

- src/domain/tree.ts 新增显式 buildChildIndex。一次可见树展开和一次拖拽槽位计算只构建一次有序父子索引，不使用可能因领域命令原地修改而失效的隐式缓存。
- visibleNodes、展开状态和末端可见节点查询共享同一索引；拖拽槽位计算也在单次流程中复用索引。
- 新增 1,000/10,000 节点树展开回归测试。修复叶节点误回退全表扫描后，相关定向测试中两种规模合计约 45ms；测试上限保守设为 2 秒，避免不同机器上的偶发抖动。

### 回收站与数据库维护

- 新增纯领域 purgeDeletedNodes，永久移除软删除节点、所属字段和折叠状态；无有效引用的附件元数据与文件一并清理。
- 若有效节点仍通过 attachment://<id> 引用待删除节点拥有的附件，附件会转移到有效引用节点，禁止删除物理文件。
- Store 永久清理严格按“保存新快照并等待 SQLite 落盘、删除无引用附件、整理数据库”执行，避免崩溃窗口留下旧快照引用。
- 设置页新增“整理数据库”和“清空回收站”。清空前显示节点数量并二次确认，无需打开回收站页面。
- Rust 新增附件批量删除和数据库维护命令。维护只按设备与节点保留最新完整 update_markdown，不压缩结构操作；随后执行 PRAGMA optimize 和 VACUUM。

### 大型工作区渲染

- 普通节点的 CodeMirror 改为近可视区域挂载：视口上下 600px 内、当前激活节点或根节点才创建编辑器，屏幕外使用等高只读占位文本。
- 节点行达到 200 行后启用 TanStack Virtual，可变高度由实际行高与间距测量；首屏尺寸未就绪时保守渲染 40 行，避免空白。
- 虚拟列表保留完整逻辑行序列用于范围选择、复制、剪切和删除；激活窗口外节点时自动滚入视口。
- 拖拽开始后临时恢复完整行布局，继续使用既有拖拽插槽和坐标语义；拖拽结束后重新启用窗口化。
- 跨节点方向键导航在相邻编辑器未挂载时通过逻辑相邻键切换 Store 焦点，避免在虚拟窗口边缘中断。

### 涉及模块

- src/domain/tree.ts
- src/domain/dropSlots.ts
- src/domain/purgeDeletedNodes.ts
- src/components/InlineEditor.tsx
- src/components/editorNavigation.ts
- src/components/TreeRow.tsx
- src/features/notebook/NotebookPanel.tsx
- src/features/notebook/hooks/useNodeRangeSelection.ts
- src/features/settings/SettingsPanel.tsx
- src/platform/attachments.ts
- src/platform/workspaceRepository.ts
- src/store/useNotebookStore.ts
- src-tauri/src/attachments.rs
- src-tauri/src/database.rs
- src-tauri/src/lib.rs

### 验证

- 覆盖显式父子索引、1,000/10,000 节点展开、1,000 行 DOM 窗口化、屏幕外编辑器延迟挂载、虚拟窗口边缘键盘导航、永久清理关联数据、有效附件引用保留和破坏性维护前强制落盘。
- 定向前端测试、TypeScript 生产构建、Rust 格式与 Rust 编译均已通过。
- 完整 npm run check：通过（模块边界、24 个测试文件/131 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户实际数据复测：待用户验收页面切换、编辑、滚动、拖拽和设置页维护入口。
