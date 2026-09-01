# 开发施工日志

## 2026-07-30：虚节点补齐统一文件插入

### 用户确认与根因

- 用户确认虚节点采用“先选择文件，确认非空后再实体化”的统一方案；取消文件选择不得创建空节点。
- 根因是 `EditorCommandMenu` 只有同时获得选文件和失败重试能力时才显示“插入文件”，普通 `InlineEditor` 已传入完整能力，`GhostEditor` 只接入了格式/结构命令。
- 附件记录必须绑定稳定 `nodeId`，因此不能直接把普通节点的回调原样传给尚无身份的虚节点；此前把文件入口设为可选能力只是防止伪造附件归属，并非产品层限制。

### 首版实现与架构复核

- 首版曾新增附件专用 `attachmentInsertionHandoff` 队列，在虚节点实体化后按节点 ID 把文件路径交给真实编辑器。
- 用户指出项目已有 `editorTarget.ts` 专门统一真实节点与虚节点的处理方式。复核确认首版虽能工作，但通过单独的 `materializeRef` 和附件队列重复承担了虚实交接职责，不符合既有“新增命令统一经过 `EditorTarget`”的结构约束。
- 用户确认改用低耦合方案：删除附件专用队列；扩展 `EditorTarget` 的通用真实编辑器交接能力；附件层只通过 CodeMirror effect 发出插入请求，保持各模块单一职责。

### 最终施工

- `src/components/editorTarget.ts`：新增 `runWithPersistedEditor`。真实节点直接使用当前 `EditorView`；虚节点只实体化一次，等待替换后的真实编辑器可解析后再执行命令，最终释放临时身份。真实编辑器解析器由调用方注入，因此模块不依赖 DOM 结构、附件或 Store。
- `src/components/attachmentUploadState.ts`：新增附件插入请求 effect 与监听扩展，只负责在 CodeMirror 编辑器之间传递文件路径，不处理节点实体化。
- `src/components/GhostEditor.tsx`：接入唯一“插入文件”菜单入口；取消选择保持草稿，确认路径后通过 `runWithPersistedEditor` 实体化并向真实编辑器发送 effect。移除直接实体化引用和附件专用队列依赖。
- `src/components/InlineEditor.tsx`：监听附件插入 effect 后调用原有 `insertPaths`，继续复用稳定占位、并行保存、选择顺序、Markdown 一次性写入、失败路径和重试流程。
- 删除首版 `src/components/attachmentInsertionHandoff.ts` 及其测试，不在 Zustand、DOM 查询或全局附件队列中维护瞬时插入任务。
- `src/components/editorTarget.test.ts`：新增虚节点等待真实编辑器和真实节点直接执行回归；`src/components/GhostEditor.test.tsx` 继续覆盖取消不实体化、只创建一个真实节点以及失败后在真实编辑器重试。
- `docs/编辑规范.md` 明确虚节点文件插入的实体化时机与交接约束；`docs/PROJECT_INDEX.md` 已改为索引 `EditorTarget` 与 CodeMirror effect 方案。目录职责未变化。

### 验证

- 重构后定向测试通过：4 个测试文件/47 条测试，覆盖 `EditorTarget` 虚实分流、虚节点文件选择、普通节点附件事务和 Markdown 插入规划。
- 完整 `npm run check` 通过：模块边界、39 个测试文件/317 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有 editor chunk 超过 500 kB。
- 生产构建由首版 3668 个模块降为 3667 个模块，确认附件专用交接模块已移除。
- README 暂不更新，等待用户实际验收虚节点文件选择、取消和失败重试后再同步使用者说明。

## 2026-07-30：补齐节点与行内文本选区菜单

### 用户反馈

- 当前只有节点末端的行内 `+` 菜单，节点选区和行内文本选区没有就地操作入口。

### 本轮施工

- 新增 `src/components/SelectionMenu.tsx`：提供通过 Portal 定位的紧凑浮动工具栏，支持视口边缘收缩和上下翻转，图标按钮保留可访问名称。
- `src/components/InlineEditor.tsx`：监听 CodeMirror 非空选区并显示文本选区菜单，复用现有粗体、斜体、删除线、高亮、行内代码命令，并提供复制/剪切；打开 `+` 命令菜单时自动互斥隐藏。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：暴露节点选区复制、剪切、删除、批量缩进和提升动作，菜单与键盘路径共用删除回退和领域命令。
- `src/features/notebook/NotebookPanel.tsx`：按选中节点根行的整体矩形定位节点选区菜单，提供复制、剪切、缩进、提升和删除。
- `src/App.css`：增加统一浮动工具栏和图标按钮样式；未改变正文选区、节点选区和键盘焦点视觉规则。
- `src/components/SelectionMenu.test.tsx`、`src/components/InlineEditor.test.tsx`、`src/features/notebook/NotebookPanel.test.tsx`：覆盖菜单定位、文本选区菜单出现、节点选区菜单出现以及与原有 `+` 菜单互斥。

### 约束与后续

- 不新增 Store 数据、领域命令或同步字段；选区菜单只编排现有编辑和节点操作。
- README 暂不更新，等待用户实际验收后按项目约定同步面向使用者的能力说明。

### 拖选显示时序续修

- 用户实测要求菜单只在拖动结束后显示，不能在节点或文字仍处于拖选过程中提前遮挡内容。
- `useNodeRangeSelection` 增加仅在 `pointerup` 后成立的菜单提交状态；节点范围预览继续实时高亮，但菜单锚点暂不生成。`Ctrl/Cmd+点击`和键盘形成的非拖动选区仍可立即显示。
- `InlineEditor` 在编辑器 `mousedown` 后暂停文本菜单同步，由全局 `mouseup`/`pointerup` 等待 CodeMirror 完成最终选区后再定位；取消拖动时清理待显示状态。
- 回归测试同时断言节点和文本菜单在拖动中不存在、松开后出现。

### 默认方位与节点对齐续修

- 用户要求选区菜单默认显示在对象上方，并让节点菜单从选中对象左边缘开始，而不是按整体选区居中。
- `SelectionMenu` 的通用默认方位改为上方；顶部空间不足时翻到下方，两侧继续执行视口收边。
- 通用菜单增加 `start` 水平对齐选项；行内文本菜单保持居中，`NotebookPanel` 的节点菜单显式使用左对齐。
- 定位回归覆盖默认上方、顶部空间不足向下翻转，以及节点菜单左边缘对齐。

### 节点菜单动作与操作反馈续修

- 用户实测发现复制没有视觉提示，节点复制/剪切没有可观察效果，缩进和删除按钮也不执行。
- 根因是 Portal 只改变菜单 DOM 挂载位置，React 事件仍沿组件树传播；节点选区捕获器先把菜单按钮当作普通控件清空选区，提交后的点击抑制又会拦截菜单 `click`，导致动作回调在执行前随菜单卸载。
- `SelectionMenu` 增加专属事件所有权标记；`useNodeRangeSelection` 对菜单的 `pointerdown` 和 `click` 均保留选区，不再进入画布清理与点击抑制路径。
- 新增 `src/platform/clipboard.ts`，优先使用 Clipboard API，并为 WebView 提供 `execCommand("copy")` 回退。节点复制导出带相对层级缩进的纯文本；剪切仅在复制成功后删除选中内容子树。
- 复制成功显示勾选和“已复制”，失败显示“复制失败”；缩进/提升不显示操作提示，不可执行时不渲染对应按钮；两个层级动作同时可用时按“提升、缩进”排列。
- 回归通过真实菜单按钮的 `pointerdown + click` 覆盖复制、剪切、缩进和删除，防止只测 Hook/快捷键而遗漏 Portal 事件链。
- 按用户对通用图标语义的复核，将缩进/提升从容易被理解为上下移动的 `ArrowDownToLine` / `ArrowUpFromLine` 改为标准列表层级图标 `ListIndentIncrease` / `ListIndentDecrease`，并增加图标回归断言。
- 修复缩进/提升后的菜单锚点：左对齐改为节点圆点/正文对象的实际左边缘，并在 100ms 树布局动画期间逐帧重新测量，避免菜单停在操作前的层级位置；窗口滚动和尺寸变化时也同步更新。
- 用户实测发现进入含附件的笔记后首次缩进会让页面抖动，无附件笔记不复现。根因是图片、文本和媒体附件预览在编辑器挂载后仍会异步改变树行高度，而 FLIP Hook 只在节点结构变化时记录基线；第一次缩进因此把附件加载造成的旧纵坐标差也当成节点移动。`useTreeLayoutAnimation` 现通过 `ResizeObserver` 在无结构动画时刷新稳定行位，并在动画完成后再捕获最终布局；回归锁定附件行高变化后的首次缩进只产生横向层级位移。

### 当前验证

- 定向测试通过：`SelectionMenu`、`InlineEditor`、`NotebookPanel` 共 87 条测试。
- 附件尺寸基线定向回归与 `NotebookPanel` 测试通过：2 个测试文件/53 条测试。
- 全量 `npm run check` 通过：模块边界、39 个测试文件/312 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有 editor chunk 超过 500 kB。
- 浏览器预览实测：节点菜单左边缘与节点圆点均为 `368px`，菜单位于节点上方；标准缩进/提升图标正确。随后按用户反馈将不可操作的层级按钮从禁用态调整为直接移除。
- 用户确认本轮功能有效无误；按项目约定更新 `README.md`，记录文本/节点选区浮动菜单、节点复制剪切与按能力显示的层级操作，以及附件异步预览下的布局稳定性。

## 2026-07-30：Tana 风格多选节点缩进

### 用户确认的真实规则

- 多选可以不连续；选中父节点会连带选中整棵子树。
- 每个选中根节点寻找当前同级中最近的未选中前置节点作为父节点；连续选中的同级节点共享同一个前置节点。
- 没有可用前置节点的项跳过，其他可执行项继续移动；节点及其子树追加到目标父节点已有子节点之后。
- 移动后保持选中状态。

### 本轮施工范围

- 新增纯领域批量缩进规则与测试。
- 多选状态下按 `Tab` 执行批量缩进，保留现有选区。
- 暂不实现取消缩进、工具栏按钮或新的选择模型。

### 实现

- `src/domain/commands/moveNode.ts` 新增纯领域批量缩进命令：基于操作前的同级关系一次性规划目标，再按可见树顺序移动选区根，避免连续选中项互相嵌套。
- `src/store/useNotebookStore.ts` 将整批结构变化作为一条 `indent_nodes` 操作记录持久化；载荷只记录实际移动的根节点。
- `src/features/notebook/hooks/useNodeRangeSelection.ts` 在节点选区状态接管无修饰键 `Tab`，操作后不清除选区；单节点编辑器原有 `Tab` 行为保持不变。
- `docs/DOMAIN_RULES.md`、`docs/编辑规范.md` 与 `docs/PROJECT_INDEX.md` 已同步业务规则、交互规范和实现/回归索引；目录结构未变化。

### 验证

- 定向测试通过：2 个测试文件/61 条测试，覆盖连续与不连续根、部分跳过、父子去重、已有子节点追加，以及界面 `Tab` 后选区保留。
- 完整 `npm run check` 通过：模块边界、37 个测试文件/293 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有 editor chunk 超过 500 kB。
- `git diff --check` 通过；仅有仓库既有的 Windows CRLF 转换提示。
- 首轮 README 暂缓更新，等待用户实际验收完整交互。

### 首轮实测反馈与续修

- 用户实测发现 `Ctrl` 多选无效：现有选择状态只能表达一个连续范围，尚未接入修饰键点击形成离散选区。
- 用户实测发现多选状态按 `Shift+Tab` 无反应：首轮只实现批量缩进，选区键盘处理器随后拦截了未实现的提升按键。
- 续修将选择状态升级为可同时表达离散节点和活动范围，并补齐批量提升领域命令；缩进、提升后均保留选区。

### 续修实现与验证

- `src/features/notebook/hooks/useNodeRangeSelection.ts`：加入 `Ctrl/Cmd+点击` 的离散节点切换；连续拖拽仍使用范围选择，离散项与活动项统一展开为子树后参与操作。
- `src/domain/commands/moveNode.ts`：新增批量提升命令，按原顺序把可提升的选中根放到原父节点之后；当前页面根边界项单独跳过。
- `src/store/useNotebookStore.ts`：新增 `outdentNodes` 与 `outdent_nodes` 操作日志；`Shift+Tab` 接入选区批量提升。
- 回归测试新增：离散选区增删、离散选区缩进、多选 `Shift+Tab` 提升、父子去重和部分边界成功。
- 定向测试通过：2 个测试文件/66 条测试。完整 `npm run check` 通过：模块边界、37 个测试文件/298 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仍仅提示既有 editor chunk 超过 500 kB。
- 用户实际验收通过：`Ctrl` 离散多选、选区 `Tab` 缩进和 `Shift+Tab` 提升均符合预期。
- 按项目约定同步更新 `README.md` 当前能力，记录连续/离散选择和批量层级操作。

## 2026-07-29：虚节点统一编辑目标适配

### 用户确认

- 用户确认采用“临时草稿 + 统一命令入口”方案：虚节点不持久化为空节点，但交互上应与真实节点保持一致，避免未来每增加一种节点功能就重复适配 `GhostEditor`。

### 修改

- 新增 `src/components/editorTarget.ts`：定义真实节点/临时草稿的统一 `EditorTarget`，并提供“需要 nodeId 时先实体化，再执行命令”的单一入口；实体化结果在当前编辑会话内缓存，避免同一草稿重复创建。
- `src/components/GhostEditor.tsx`：`Tab`/`Shift+Tab` 改为通过统一入口先创建空节点，再执行缩进/提升；虚节点接入与真实节点共用的 `EditorCommandMenu`，单独按下并松开 `Ctrl` 时可以打开格式与插入菜单。
- `src/components/InlineEditor.tsx`：缩进、提升、前后合并统一通过 `EditorTarget` 入口执行，真实节点继续直接复用已有 nodeId。
- `src/components/EditorCommandMenu.tsx`：菜单文件入口改为可选能力，使草稿可先共享格式/结构/节点命令，不被迫伪造附件持久化身份。
- `src/components/editorTarget.test.ts`、`src/components/GhostEditor.test.tsx`：覆盖草稿实体化缓存、真实节点直通、虚节点 Tab 缩进和 Ctrl 菜单入口。

### 实测反馈与修复

- 用户实测发现：页面末尾虚节点按 `Tab` 没有可见反应；可提升层级的虚节点按 `Shift+Tab` 会改变层级，但没有布局动画。
- 根因是草稿实体化与缩进/提升在同一按键回调内连续执行。React 无法先提交“虚行替换为真实行”的中间布局；同时 FLIP 动画要求前后树行 key 集合一致，而虚行 key `ghost:<parentId>` 与新节点 ID 不同，因此首次布局变化只会重建动画基线。
- `src/components/editorTarget.ts`：真实节点命令继续同步执行；草稿首次实体化后统一等待两次动画帧，先让真实节点行完成挂载并由布局 Hook 捕获稳定基线，再执行原节点命令。命令调度仍位于统一入口，不在 `GhostEditor` 维护单独的实体化规则。
- `src/features/notebook/NotebookPanel.test.tsx`：新增真实页面渲染回归，从页面末尾虚节点触发 `Tab`、从子级虚节点触发 `Shift+Tab`，分别断言新节点最终父级、仅创建一次以及 FLIP 动画被调用。
- `src/components/editorTarget.test.ts`：锁定草稿命令在实体化后的两帧交接和真实节点同步直通行为。
- 用户继续实测发现：页面末尾虚节点首次 `Tab` 正常，之后再次按 `Tab` 不再创建或缩进新节点。根因是该插入位会长期复用，而统一目标把首次实体化得到的节点 ID 永久留在草稿对象中，后续命令因此误用旧节点身份。
- `src/components/editorTarget.ts`：草稿节点 ID 改为仅在“实体化到延迟命令交接”期间有效；命令完成或抛错后统一释放，允许同一页面末尾插入位再次实体化。交接未完成时的快速重复按键会被消费但不会重复创建，也不会再次操作旧节点。
- `src/components/editorTarget.test.ts`、`src/features/notebook/NotebookPanel.test.tsx`：覆盖交接期间防重复、交接后身份释放，以及同一页面末尾虚节点连续两次 `Tab` 均各自创建一个新节点并缩进到正确父级。
- 用户继续实测提出两点：无效 `Tab` 仍会把虚节点实体化；真实节点缩进到空父节点、取代其虚占位行时没有动画。
- `src/domain/commands/moveNode.ts`：新增纯逻辑草稿移动预检。它在内存状态中放入临时候选节点，再调用与真实节点完全相同的 `executeMoveNode` 判断是否会发生结构变化，不复制缩进、提升或页面边界规则，也不写入 Store、操作日志或持久化。
- `src/components/GhostEditor.tsx`：`Tab`/`Shift+Tab` 先执行上述预检；无前置同级、已到页面根边界等无效操作只消费按键并保留虚节点，只有可执行操作才进入统一实体化与命令交接。
- `src/features/notebook/hooks/useTreeLayoutAnimation.ts`：动画基线兼容性改为比较稳定真实节点集合。只有占位行出现或消失时，仍对前后都存在的真实节点执行 FLIP；真实节点集合本身增删时继续等待下一帧重建稳定基线。
- `src/domain/commands/nodeCommands.test.ts`、`src/features/notebook/NotebookPanel.test.tsx`：覆盖预检复用领域规则且不污染状态、无效 `Tab`/`Shift+Tab` 不实体化，以及真实节点缩进并取代空父节点虚占位行时触发布局动画。

### 验证

- 定向测试通过：4 个文件/41 条测试。
- 完整 `npm run check`：通过（模块边界、37 个测试文件/281 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- 实测修复定向测试通过：3 个文件/49 条测试。
- 修复后完整 `npm run check` 通过（模块边界、37 个测试文件/283 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- 连续提交修复定向测试通过：3 个文件/50 条测试。
- 连续提交修复后完整 `npm run check` 通过（模块边界、37 个测试文件/284 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- 交互可用性与占位行动画修复定向测试通过：3 个文件/64 条测试。
- 修复后完整 `npm run check` 通过（模块边界、37 个测试文件/288 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- 用户实际验收通过：虚节点无效 `Tab` 不实体化、连续有效 `Tab` 可重复创建并缩进、真实节点缩进取代虚占位行时动画正常。
- 按项目约定同步更新 `README.md` 当前能力，记录虚节点复用真实节点命令语义、仅可交互时实体化并沿用层级位移动画。

## 2026-07-29：空节点回车错误向上创建

### 根因

- 用户发现普通空节点按 `Enter` 后，新节点错误出现在当前节点上方。
- Store 使用 `before === "" && after === current.markdown` 判断“非空节点行首回车”，以便在原节点上方插入空节点；空节点的 `before`、`after` 和原文恰好全部为空字符串，因此误入同一分支。

### 修复

- `src/store/useNotebookStore.ts`：只有当前节点原文非空且光标确实位于行首时，才选择 `before` 放置；空节点回车改走常规拆分，在当前节点视觉下方创建新空节点并聚焦。
- 保留展开父节点拆到首个子级、折叠父节点拆到下方同级，以及活动页面根拆到子级的既有规则。
- `src/store/useNotebookStore.test.ts` 与 `src/components/InlineEditor.test.tsx`：分别覆盖 Store 顺序和真实编辑器 `Enter` 按键路径。
- `docs/编辑规范.md`：补充空节点回车与非空节点行首回车的明确区别；项目结构与 SPEC 索引未变化。

### 验证

- 定向测试通过：3 个测试文件/64 条测试。
- 完整 `npm run check` 通过：模块边界、36 个测试文件/277 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- `git diff --check` 通过。
- 用户实际验收通过：普通空节点按 `Enter` 后，新空节点稳定出现在当前节点下方并获得焦点。
- 按项目约定同步更新 `README.md`，在当前能力中记录空节点回车向下连续创建。

## 2026-07-29：待办原子范围包含分隔空格

### 用户反馈与判断

- 用户指出待办原子范围目前只有 `[ ]`，按待办语义应包含后面的分隔空格。
- `NodeTask` 解析规则本来就要求 `[ ]`/`[x]` 后存在空格或制表符；预览中的复选框组件代表整个待办前缀，分隔字符不应留下一个可单独落点的视觉空白位置。

### 修改

- `src/components/markdown/markdownDecorations.ts`：保持 `NodeTaskMark` 语法节点只描述三个状态字符，在生成预览替换装饰时将紧随其后的空格或制表符一并纳入组件原子范围。
- 不修改 Markdown 持久化文本；复选框点击仍只把 `[ ]` 与 `[x]` 中间字符互换。
- `src/components/markdown/markdownDecorations.test.ts` 与 `docs/MARKDOWN_SPEC.md`：锁定 `[ ] ` 范围为 `0..4`，并记录预览态组件边界。

### 验证

- 定向测试通过：2 个测试文件/55 条测试。
- 完整 `npm run check` 通过：模块边界、36 个测试文件/275 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- `git diff --check` 通过。
- README 暂不更新，待用户实际验收本轮待办光标行为后再按项目约定同步。

## 2026-07-29：连续波浪号被误隐藏

### 根因

- 用户发现依次输入 `~`、`~~`、`~~~` 时，第三个字符会导致全部波浪号隐藏。
- 删除线本身没有特殊处理。真正原因是 Lezer Markdown 会把节点开头的 `~~~` 解析为围栏代码块的起始标记 `FencedCode/CodeMark`；Live Preview 随后按通用代码标记规则隐藏 `CodeMark`，造成三个字符一起消失。
- 本项目的一个节点是一段独立单行内容，既有 Markdown SPEC 已明确不支持需要跨节点连续文本的围栏代码块，因此该解析结果既不可完成，也与正在输入删除线分隔符冲突。

### 修复

- `src/components/markdown/markdownLanguage.ts`：从节点 Markdown 子集中移除 `FencedCode` 解析；保留 `InlineCode`，不改变反引号行内代码。
- 未增加 `StrikethroughMark`、字符 `~` 或删除线装饰特判；粗体、斜体、删除线、高亮和行内代码继续共用既有 Live Preview 显示/隐藏机制。
- `src/components/markdown/markdownLanguage.test.ts` 与 `src/components/markdown/markdownDecorations.test.ts`：新增语法树边界测试和真实逐字符输入 `~ / ~~ / ~~~ / ~~~~` 回归。

### 验证

- 定向测试通过：3 个测试文件/75 条测试，覆盖节点 Markdown 语言、Live Preview 和 InlineEditor。
- 完整 `npm run check` 通过：模块边界、36 个测试文件/275 条测试、TypeScript/生产构建、Rust 格式和 Rust 编译均正常；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- `git diff --check` 通过。
- README 暂不更新，待用户实际验收本轮修复后再按项目约定同步。

## 2026-07-29：文件拖放接收区域修正

### 用户反馈

- 用户指出“支持拖放”没有可见使用场景，实际从系统文件管理器把文件拖入笔记时没有反应。
- 根因是文件 `dragover/drop` 监听只挂在 CodeMirror 内层；拖到节点内容外层空白、编辑器边缘或节点行内容区域时，事件未进入该监听。

### 实现

- `src/components/InlineEditor.tsx`：在 `.inline-editor-shell` 增加文件拖放接收，文件拖入整个编辑器壳层时阻止浏览器打开文件、设置复制效果，并复用既有附件保存、异步占位和 Markdown 插入流程。
- 保留 CodeMirror 内层监听，确保拖到文字内容时仍按编辑器坐标设置插入位置；坐标计算异常时回退到当前选区，不影响附件插入。
- 普通文本拖放不被文件处理器拦截，避免破坏 CodeMirror 原有文本拖拽。
- 用户真实验收仍无反应后复盘：上一版测试只模拟事件打到编辑器壳层，没有覆盖 Windows 资源管理器真实拖入时命中节点行、按钮或行内空白的路径。
- `src/components/InlineEditor.tsx`：补充文档捕获级文件拖放兜底，根据鼠标落点定位当前节点行并转交给该行编辑器；同时扩大文件拖动识别，兼容真实 `DataTransfer` 的 `Files` 类型和 drop 阶段的 `files` 列表。
- 继续核查桌面端后确认真正的系统边界：Tauri 2 在 Windows 默认启用 WebView 原生拖放接管，官方配置说明明确指出这会阻止前端使用 HTML5 文件拖放；此前 JSDOM 和浏览器预览都不经过这一层，因此会出现自动测试通过而桌面应用无反应。
- `src-tauri/tauri.conf.json`：为主窗口设置 `dragDropEnabled: false`，项目当前未使用 Tauri 原生拖放事件，关闭接管后由前端统一处理文件拖入。

### 验证

- `src/components/InlineEditor.test.tsx` 新增编辑器壳层文件 `dragover/drop`、节点行外层文件 `drop`、附件插入和普通文本拖放回归测试。
- 定向测试通过：1 个测试文件/21 条测试。
- 配置字段与已安装的 Tauri 2 schema 对照确认：Windows 前端 HTML5 拖放必须关闭 `dragDropEnabled`。
- 完整 `npm run check` 通过：模块边界、35 个测试文件/261 条测试、TypeScript/生产构建、Rust 格式与编译均正常；仅有既有 CodeMirror 分包体积警告。
- `npx tauri build --debug --no-bundle` 已成功解析新配置并完成前端构建，最终链接因正在运行的 `src-tauri/target/debug/tauri-app.exe` 被 Windows 锁定而停止；未强制结束用户进程。桌面端真实拖放仍需关闭并重新启动窗口后验收。
- README 暂不更新，待用户实际验收本轮拖放修复后再同步当前能力。

## 2026-07-29：统一输入菜单与文件插入流程

### 用户确认

- 用户认可“直接操作 + 命令菜单 + Markdown 快捷语法”三层并存的整体方向；具体触发按键暂不确定，先定义与按键无关的语义。
- 用户确认所谓“命令分类”只应是菜单内部的功能分组，不要求先选分类；文档统一改称“菜单功能分组”。
- 文件只保留一个“插入文件”入口，选择后自动识别预览类型，不为图片、音频、视频、PDF 等分别设置按钮；未来只有录音、拍照等不同采集流程才考虑独立动作。

### 设计决策

- `docs/编辑规范.md` 新增统一输入与插入语义：格式、节点、文件和未来 Supertag 使用同一套命令概念，可由菜单、按钮、快捷键、拖放或粘贴触发。
- 文件选择、拖放和剪贴板文件统一走附件插入事务，使用稳定占位项、处理中/成功/失败状态、多文件顺序保持、重试与清理规则；处理中止留待后续。
- 网址粘贴按选区和安全资源类型区分普通链接与远程图片；纯文本多行粘贴沿用现有节点拆分，不强制改写 Markdown。
- 附件、链接、节点链接和待办继续作为原子内容单元；每次用户意图形成可理解的撤销单元，Live Preview 不改变持久化 Markdown。
- 预留 `insertAttachment`、`insertNodeLink`、`applySupertag`、`insertField` 等语义命令边界；Supertag 字段可复用附件组件，但字段数据不写入二进制附件记录。
- `docs/PROJECT_INDEX.md` 同步登记实现与回归入口；保持现有节点、附件、Markdown 和同步数据格式不变。

### 实现

- `src/components/EditorCommandMenu.tsx`：新增节点末端的单一 `+` 菜单，支持搜索和“格式 / 结构 / 节点 / 文件”视觉分组；首批复用现有 Markdown 命令，并提供节点链接和唯一的“插入文件”入口。具体键盘触发方式仍未确定。
- `src/components/markdown/markdownCommands.ts`：在既有行内标记命令上补充标题、引用、待办前缀切换及通用文本插入，菜单与快捷键调用同一命令实现。
- `src/components/attachmentInsertion.ts`：集中生成安全转义的附件 Markdown，并按真实选区、相邻空白和用户选择顺序规划一次性插入。
- `src/components/attachmentUploadState.ts`：使用 CodeMirror 状态字段维护处理中的零数据占位范围；范围随文档变化映射，避免异步完成后插到过期光标位置。
- `src/components/InlineEditor.tsx`：文件选择、多选、剪贴板文件和文件拖放统一调用同一流程；并行保存后按选择顺序插入。全部失败保留原选区，部分失败只重试失败项，菜单展示首个错误原因。
- `src/store/useNotebookStore.ts`：`addAttachment` 收敛为只保存并返回 `AttachmentRecord`，不再隐式把 Markdown 追加到节点末尾；Markdown 插入由持有真实选区的编辑器负责。
- `src/components/TreeRow.tsx`：移除原有单文件、有限扩展名的回形针入口，避免与统一菜单形成两套文件行为。
- `src/App.css` 与 `src/components/editorTheme.ts`：增加紧凑菜单、单一 `+` 触发器和文件处理中占位样式；菜单打开时允许越过短树列表边界。
- 当前未实现网址智能粘贴、处理中止，以及撤销 Markdown 时同步删除无引用附件记录；文档明确保留为后续工作，不把目标语义误记为现状。

### 验证

- 定向测试通过：4 个测试文件/57 条测试，覆盖菜单格式命令、节点链接、多文件顺序、文件粘贴、异步锚点映射、失败保留选区与重试、附件 Store 不隐式改写 Markdown。
- TypeScript `npx tsc --noEmit` 通过。
- 全量并发测试首次运行时，后台动态导入笔记面板超过测试库默认 1 秒；该生命周期测试单独运行通过，已仅为其真实异步加载断言设置 3 秒上限，应用加载逻辑和其他断言不变。
- 完整 `npm run check` 已通过：模块边界、35 个测试文件/258 条测试、TypeScript/生产构建、Rust 格式与编译均正常；仅有既有 CodeMirror 分包体积警告。
- 应用内浏览器实测通过：`+` 菜单打开、搜索筛选、格式命令、唯一多选文件入口和真实文本附件预览均正常，菜单无横向溢出，控制台无警告或错误。

### 下一步

- 用户实际验收通过；按项目约定已同步更新 `README.md` 当前能力。

## 2026-07-29：折叠附件紧凑尺寸与滚动条槽位

### 修改

- 用户确认折叠按钮黑框和标题栏元素间距已经正常，只剩折叠附件尺寸过大；折叠态改为内容自适应宽度，移除完整预览的内边距、背景和可见边框，标题栏保持树行高度。
- `.content-area`、`.settings-page` 与 `.dashboard` 预留稳定的双侧滚动条槽位，纵向滚动条出现或消失时不再挤压横向居中排版。

### 验证

- 修改后的完整 `npm run check` 已通过：34 个测试文件/244 条测试、模块边界、TypeScript/生产构建、Rust 格式与编译均正常；仅有既有 CodeMirror 分包体积警告。
- 用户在切换到统一输入需求前尚未完成这一补充的最终视觉验收，因此 README 暂不更新。

## 2026-07-28：附件预览支持独立折叠

### 范围与决策

- 用户确认图片附件、音频、视频、PDF 和文本预览使用统一的可折叠标题栏；普通文件项与远程 Markdown 图片保持原行为。
- 折叠状态按“节点 ID + 附件 ID”作为当前设备视图偏好保存，不进入 Markdown、附件记录、操作日志或同步协议。同一附件在不同节点中的展开状态互不影响，新位置默认展开。
- 为未来 Tana 式 Supertag 保持边界：附件预览组件只依赖节点与附件上下文，可供字段引用复用；Supertag、字段与关系仍属于节点模型，不写入二进制附件记录。
- `src/components/markdown/attachmentPreviewPreferences.ts`：新增容错的本机折叠偏好读写，存储键独立于工作区持久化。
- `src/components/markdown/markdownEditorContext.ts` 与 `src/components/InlineEditor.tsx`：给 Markdown 扩展传递当前节点 ID，使预览状态可按出现位置隔离；GhostEditor 继续使用无节点上下文，不提前产生视图偏好。
- `src/components/markdown/markdownWidgets.ts`：图片附件、音频、视频、PDF 和文本统一使用标题栏，显示类型图标、文件名、大小、折叠箭头与系统打开入口；点击箭头或标题栏空白切换。收起后卸载预览正文，文本读取同时中止。
- `src/components/markdown/markdownDecorations.ts`：登记图片附件进入统一可折叠组件，远程图片继续沿用原有图片组件。
- `src/components/editorTheme.ts`：补充稳定标题栏尺寸、箭头旋转、折叠态、文件大小和各类正文布局。
- `docs/MARKDOWN_SPEC.md` 与 `docs/PROJECT_INDEX.md`：记录交互语义、设备边界、Supertag 兼容方向和回归入口。README 暂不更新，待用户实际验收后再同步。

### 验证

- 定向测试通过：4 个测试文件/50 条测试，覆盖本机偏好容错、按节点隔离、重新挂载保持状态、折叠后正文卸载及现有附件预览。
- TypeScript `npx tsc --noEmit` 与 `git diff --check` 通过。
- 待完成完整 `npm run check` 与应用内浏览器实测。

## 2026-07-28：扩展附件原生预览类型

### 范围与决策

- 用户确认一次加入浏览器/WebView 可合理内嵌的附件类型：图片、音频、视频、PDF、文本与常见代码；其余格式继续由系统应用打开。
- 保持现有 `attachment://<id>`、附件记录、SQLite 与同步数据格式不变，不开放 Markdown HTML，也不引入按扩展名单独实现的播放器。
- `src/components/markdown/attachmentPreview.ts`：新增独立的 MIME/扩展名分类规则，将附件归为音频、视频、PDF、文本或普通文件；图片继续沿用原有图片路径。
- `src/components/markdown/markdownWidgets.ts`：新增原生 `<audio>`、`<video>`、PDF `<iframe>` 和纯文本 `<pre>` 预览。所有内嵌组件保留系统打开入口；文本通过 `textContent` 展示，不执行附件内容，并限制为 512 KiB。读取失败、文件超限或类型未知时提供明确回退。
- `src/components/markdown/markdownInteractions.ts`：附件快照补充文件大小，供文本预览上限判断；继续只接受 Store 已登记且具有受控本地 URL 的附件。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：把媒体、内嵌框和附件预览容器纳入交互控件排除范围，避免拖动播放进度、音量或滚动预览时触发节点范围选择。
- `src/components/editorTheme.ts`：补充附件预览的稳定尺寸、媒体控件、PDF 框、文本滚动区与打开按钮样式。
- `docs/MARKDOWN_SPEC.md` 与 `docs/PROJECT_INDEX.md`：记录支持范围、安全边界、实现位置和回归入口。README 暂不更新，待用户实际验收有效后再同步。

### 验证

- 定向测试通过：`src/components/markdown/attachmentPreview.test.ts` 与 `src/components/markdown/markdownDecorations.test.ts`，共 35 条测试。
- TypeScript `npx tsc --noEmit` 与 `git diff --check` 通过。
- 完整 `npm run check` 通过：模块边界、33 个测试文件/241 条测试、TypeScript/生产构建、Rust 格式与 Rust 编译均正常；Vite 仅提示既有的 CodeMirror 编辑器分包超过 500 kB。
- 应用内浏览器实测：通过正常附件上传流程预览 `docs/MARKDOWN_SPEC.md`，文本以 560px 上限宽度的受控滚动区域展示，带系统打开入口，未生成 `script` 节点，控制台无警告或错误。临时验收节点与附件已通过应用既有删除操作清理。

## 2026-07-28：修复链接菜单在短节点列表中被裁剪

### 问题与原因

- 节点数量较少时，外部链接菜单向下展开会被截断。
- 根因是 `.tree-list` 的 `overflow: clip` 裁剪了超出列表自身高度的绝对定位菜单；不是菜单层级不足。

### 修改

- 链接菜单打开时给当前 `.tree-list` 增加 `has-link-menu`，临时允许 `overflow: visible`；菜单关闭或编辑器销毁时清理该状态。
- 树列表平时继续保持 `overflow: clip`，不改变虚拟列表、拖拽命中区和层级线的默认裁剪行为。
- `docs/MARKDOWN_SPEC.md`：记录菜单打开期间的溢出规则。

### 验证

- 定向 Markdown 测试通过（25 条）；完整 `npm run check` 通过（模块边界、31 个测试文件/208 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：在节点数量很少、链接靠近列表底部时打开菜单，确认三个菜单项完整可见；关闭菜单后列表布局不变。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：外部链接增加地球识别图标

### 修改

- 新增轻量 `lucide` DOM 图标依赖；`ExternalLinkWidget` 在链接标题前加入 `Earth` 图标，图标作为低强调装饰，不单独响应点击，也不改变链接组件整体原子范围。
- `src/components/editorTheme.ts`：补充图标尺寸、基线和透明度样式，保持链接文字的原有颜色与下划线。
- `src/components/markdown/markdownDecorations.test.ts`：锁定图标存在、装饰性 `aria-hidden` 及原有链接菜单行为。
- `docs/MARKDOWN_SPEC.md`：记录外部链接的地球识别图标。

### 验证

- 首版通过 `react-dom/server` 把 React 图标转为 DOM，导致笔记页面分包从约 95KB 增长到 286KB，已撤销该方案；改用 Lucide 原生 DOM 创建后恢复为约 96KB。
- 定向 Markdown 装饰测试通过（24 条）；完整 `npm run check` 通过（模块边界、31 个测试文件/207 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：请观察普通网页链接标题左侧的地球图标，确认图标不抢文字、不影响点击和菜单打开。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：网站图标与节点链接图标

### 修改

- 外链预览优先尝试目标站点自身的 `/favicon.ico`，失败时回退 Lucide `Earth`；不使用第三方 favicon 聚合服务，避免额外泄露访问目标。
- 节点链接标题前增加图标，用户对比六种实际尺寸方案后选择 Lucide `FileText`；节点标题动态刷新时保留图标。
- `src/components/markdown/markdownDecorations.test.ts`：覆盖网站图标地址、加载失败回退和节点图标存在性。
- `docs/MARKDOWN_SPEC.md`：记录网站图标和节点链接图标规则。

### 验证

- 完整 `npm run check` 通过（模块边界、31 个测试文件/207 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：打开带 favicon 的网站链接应显示网站图标，无 favicon 时显示地球；节点链接应显示网络节点图标。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：原子组件内容边界与链接菜单删除

### 问题与原因

- 当节点内容只有一个完整原子链接、光标位于组件之后时，`Backspace` 会把节点合并到上一个节点，而不是删除链接组件。
- 原因是视觉边界判断会跨过原子范围回溯到文档开头，把“组件后的光标”错误等同于“节点开头”，于是提前触发 `mergeWithPrev`。
- 外部链接菜单只有“打开 / 修改”，缺少直接删除完整链接的入口。

### 修改

- `src/components/markdown/markdownDecorations.ts`：原子组件明确计为一个可见内容单元；只有不代表内容的隐藏控制范围才允许在视觉边界计算中折叠。组件前为视觉起点、组件后为视觉终点，不再把两侧错误地同时视作节点边界。
- `src/components/editorKeymap.ts`：保持节点边界处理与组件删除的常规顺序，由正确的内容边界自然决定行为，不依赖组件删除命令抢先拦截。
- `src/components/markdown/markdownWidgets.ts`：外链菜单新增“删除”，精确移除该组件对应的完整 Markdown 范围，并将光标落到原位置。
- `src/components/InlineEditor.test.tsx`：覆盖仅含外链组件的节点在有前一兄弟时退格只清空组件、不合并节点。
- `src/components/markdown/markdownDecorations.test.ts`：覆盖组件作为可见内容单元的首尾边界，以及菜单删除完整外链和删除后的光标位置。
- `docs/MARKDOWN_SPEC.md`：记录链接菜单删除入口和原子组件优先于跨节点合并的规则。
- 项目结构与测试入口沿用 `docs/PROJECT_INDEX.md` 中“Markdown 可见光标与删除语义”索引，无需新增重复条目。

### 验证

- 定向测试通过（2 个测试文件、35 条测试）。
- 完整 `npm run check` 通过（模块边界、31 个测试文件/207 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：请在仅含一个链接组件且前方存在兄弟节点的节点末尾按 `Backspace`，确认只删链接且节点不合并；再从链接菜单点击“删除”，确认完整链接消失。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：链接地址输入期间延迟原子预览

### 问题与原因

- 用户输入 Markdown 链接地址到 `.co` 时，链接看似被自动完成，无法继续输入 `.com`。
- 编辑器会自动补齐右括号；`.co` 已符合两位顶级域名的安全 URL 规则，因此完整的 `[标题](example.co)` 被 Live Preview 立即替换为原子链接组件。源码没有被补成 `.com`，但光标因组件替换退出了地址编辑。

### 修改

- `src/components/markdown/markdownDecorations.ts`：外链空光标位于链接源码内部时暂缓组件替换；光标离开链接范围后再恢复完整原子预览。
- `src/components/markdown/markdownDecorations.test.ts`：覆盖自动闭合右括号内从 `.co` 继续输入到 `.com`，以及离开后恢复链接组件。
- `docs/MARKDOWN_SPEC.md`：补充链接输入期与完成后预览的边界。

### 验证

- 定向链接装饰测试通过（22 条）；完整 `npm run check` 通过（模块边界、31 个测试文件/204 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：请在自动闭合的链接右括号前输入 `example.com`，确认 `.co` 阶段不会提前变成链接组件，光标离开后才预览。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：主页最近编辑改为真实页面上下文

### 语义确认

- 用户明确“最近编辑”展示的是编辑发生时的页面，而不是被编辑节点，也不能从节点父链向上猜测页面。
- 页面身份等于操作发生时的 `activeRootId`：在“所有笔记”直接编辑时为工作区根，在“今天”直接编辑时为当天日期页，进入任意节点后编辑时为该节点页面。

### 修改

- `NotebookState` 新增持久化的 `recentPageEdits: pageId -> editedAt`；旧快照缺少该字段时规范化为空表，不伪造无法还原的历史页面。
- Store 在内容节点新增、修改、移动或删除等真实变化提交时，以当时 `activeRootId` 更新页面时间；对应操作载荷同步附带 `pageId`。
- `src/domain/recentPages.ts`：按已记录页面直接排序和限量，过滤已删除页面，并提供工作区根、日期页和内容页标题。
- `DashboardPanel` 不再按节点 `updatedAt` 展示内部节点；改为展示去重后的页面并通过 `openRoot(page.id)` 打开真实页面。
- 永久清理页面节点时同步移除对应最近页面记录。
- 更新 `docs/DOMAIN_RULES.md`、`docs/SYNC_PROTOCOL.md` 和 `docs/PROJECT_INDEX.md`。

### 验证

- 定向测试通过（5 个测试文件、30 条测试）；生产构建通过。
- 完整 `npm run check` 通过（模块边界、31 个测试文件/203 条测试、生产构建、Rust 格式和 Rust 编译）。
- `git diff --check` 无空白错误；仅报告仓库既有的 Windows CRLF 转换提示。
- 用户复测：请分别在“所有笔记”“今天”和进入某节点后的页面中编辑内部节点，再回主页确认显示和打开的是对应页面。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：消除新建空节点圆点闪色

### 问题与原因

- 用户观察到在树末尾虚节点或普通节点创建新空节点时，圆点会短暂变色，造成节点似乎创建在错误位置的视觉误会。
- 根因不是虚节点实体化或节点排序，而是所有新空节点都会立即获得编辑器焦点：圆点从空节点隐藏态 `opacity: 0` 切换到聚焦态 `.38`，并执行 `.22s` 的透明度过渡。

### 修改

- `src/App.css`：空节点因 `focus-within` 显示圆点时不再执行透明度动画，直接进入稳定聚焦态；普通圆点过渡、悬停缩放以及空节点失焦隐藏语义保持不变。

### 验证

- 完整 `npm run check` 通过（模块边界、29 个测试文件/199 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：请分别在普通节点按 Enter 创建空节点、在树末尾虚节点按 Enter，确认圆点不再闪色且节点位置观感稳定。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：按选区边界升级 Shift+方向键节点选择

### 问题与原因

- 编辑器文本选区到达节点边界后继续按 Shift+上/下方向键，旧逻辑会直接创建当前节点到相邻节点的范围选区，跳过当前节点单独选中状态。
- 用户澄清交互应由选区是否到达边界决定，而不是由固定按键次数决定。

### 修改

- `src/features/notebook/hooks/useNodeRangeSelection.ts`：文本选区未到边界时仍由 CodeMirror 正常扩展；选区头到达边界后继续向外扩展时，先升级为当前节点单独选中，之后才扩展到相邻节点。
- 空内容节点的光标天然位于边界，向外扩展时直接进入当前节点单独选中。
- Shift+左/右保持既有跨节点选择语义，本轮只调整用户指定的上/下方向键。
- `src/features/notebook/NotebookPanel.test.tsx`：新增“边界文本选区 -> 当前节点 -> 相邻节点”的回归测试。
- `docs/编辑规范.md` 与 `docs/PROJECT_INDEX.md`：记录边界升级规则及实现、回归入口。

### 验证

- 首版按固定次数实现后，依据用户澄清改为按选区边界升级。
- 二次实测发现旧边界函数判断的是“本次移动将到达边界”，导致单行文本中间的 Shift+上/下也直接升级为节点；改为检查按键前选区活动端是否已位于文档首/尾，并增加文本中部不得升级的回归测试。
- 用户补充节点多选时单按方向键应退出选择；新增无修饰方向键清除节点范围选区并聚焦活动节点的行为，Shift+方向键仍保留扩展语义。
- 定向 `NotebookPanel` 测试通过（21 条）；完整 `npm run check` 通过（模块边界、29 个测试文件/199 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测：请从节点内容中部开始 Shift+下/上扩展，确认到边界前保持文本选区，越过边界时先选中当前节点，再继续才选中相邻节点。
- README 暂不更新，待用户确认本轮工作有效无误后再更新。

## 2026-07-28：Markdown 首轮完善（已验收）

### 已确认范围

- 用户确认节点树本身承担列表语义，首轮不支持 Markdown 列表、围栏代码块和表格。
- 首轮先完成稳定的格式核心：Markdown SPEC、语法树驱动的 Live Preview、基础行内/节点级格式和格式快捷键。
- 标准链接、节点链接与附件预览留到下一轮，不在本轮扩张导航或平台能力。

### 设计决策

- 节点 `markdown` 原文、Store 操作日志、SQLite 和同步协议保持不变，不需要数据迁移。
- 用 CodeMirror/Lezer Markdown 语法树替换全文正则识别，避免转义、未闭合标记、行内代码和嵌套格式误判。
- Markdown 解析、装饰和格式命令放入 `src/components/markdown/`，普通节点、根节点和 GhostEditor 共享扩展。
- README 暂不更新，待用户确认本轮功能有效无误后再更新。

### 计划验证

- 覆盖支持语法、转义/未闭合/代码隔离、嵌套格式、标记显隐、待办切换、快捷键包裹与取消。
- 覆盖根节点与普通节点共享扩展、撤销/重做、节点拆分、多行粘贴和中文输入法既有行为。
- 完成后运行完整 `npm run check`，并在本节补记实际结果。

### 2026-07-28 用户实测修正

- 用户反馈格式符号在编辑时持续显示，影响观感；原实现只要光标位于整个格式节点范围内就显示标记，标题节点尤其容易一直显示。
- 调整为粗体、斜体、删除线、高亮、行内代码、标题和引用标记始终隐藏，原始 Markdown 数据保持不变。
- 用户反馈中文斜体无视觉效果；根因是全局 `font-synthesis: none` 禁止为缺少斜体字形的中文字体生成合成斜体。斜体装饰局部启用 `font-synthesis: style`。
- 新增回归测试，保证光标进入格式文本后控制符仍隐藏，并验证缺少原生斜体字形时启用合成斜体。
- 浏览器实测：可见编辑文本中标题、粗体、斜体、删除线、高亮和行内代码控制符均隐藏；中文斜体计算样式为 `font-style: italic` 与 `font-synthesis: style`；控制台无警告或错误。
- 完整 `npm run check`：通过（模块边界、28 个测试文件/162 条测试、生产构建、Rust 格式和 Rust 编译）。
- README 继续保持不变，等待本轮修正后的用户复测。

### 2026-07-28 标记按需显形

- 用户确认采用“默认隐藏、边界显形、源码模式”的折中交互，避免控制符一直显示或永远无法直接编辑。
- 空光标贴近某个格式节点的起止边界时，只显示当前这一组控制符；嵌套格式优先最内层。
- 标题与引用在节点开头或正文起点显形；默认隐藏时同步隐藏前缀后的空格。
- 新增 `Ctrl/Cmd+Shift+M` 当前编辑器源码模式；失焦自动恢复预览，待办在源码模式显示原始 `[ ]/[x]`。
- `Ctrl/Cmd+Shift+M` 使用高优先级大小写无关的 DOM 键盘处理，兼容内嵌浏览器对 `M` 键事件的规范化差异；格式快捷键仍由共享 keymap 处理。
- 浏览器实测：光标位于标题开头时显示 `# `，离开边界立即隐藏；源码模式显示完整 Markdown，切换设置页造成失焦后自动恢复预览；控制台无错误或警告。
- 完整 `npm run check`：通过（模块边界、28 个测试文件/166 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户复测发现光标位于双字符结束标记中间（如 `**粗体*|*`）时未显形；边界判断补充控制符内部位置，起止标记内部均保持当前组显形。
- 新增回归测试覆盖双字符起止标记内部的光标位置。浏览器精确复测 `**粗体*|*` 时仅显示当前粗体控制符，其他格式标记保持隐藏；控制台无错误或警告。
- 完整 `npm run check`：通过（模块边界、28 个测试文件/167 条测试、生产构建、Rust 格式和 Rust 编译）。

### 2026-07-28 整页删除后的焦点修复

- 用户反馈删除当前页全部节点后光标丢失。
- 根因是整页范围选择同时包含页面末尾的 GhostEditor；旧焦点算法只查找选区外节点，找不到时退回首个被删节点的父级。该父级在大纲页可能随最后一个内容节点删除而隐藏，导致 Store 指向不存在的编辑器。
- 删除后若选区外没有可用行，改为优先聚焦选区中未被删除的最后一个占位行，即当前页面的 GhostEditor，使用户可以直接继续输入。
- 延迟聚焦使用精确的 `data-selection-key` 属性值匹配，不再依赖部分测试环境或旧 WebView 缺失的 `CSS.escape`。
- 新增响应 Store 更新的界面回归测试，覆盖整页全选、删除全部内容、空日期从大纲隐藏以及页面级 GhostEditor 自动获得焦点。
- 完整 `npm run check`：通过（模块边界、28 个测试文件/168 条测试、生产构建、Rust 格式和 Rust 编译）。

### 2026-07-28 禁用引用式链接定义

- 用户反馈节点以 `[1]:` 开头时，后续粗体等语法全部失效。
- 根因是标准 Markdown 将行首 `[标识]:内容` 解析为 `LinkReference` 块，节点内后续文本因此不再进入普通行内语法解析。
- 用户确认本项目只保留后续计划中的 `[文字](地址)` 行内链接，不支持引用式链接定义。
- 节点 Markdown 配置移除 `LinkReference` 块解析，使 `[1]:节点**粗体**` 继续识别粗体；普通 `[文字](地址)` 仍保留为 `Link` 语法节点。
- 更新 Markdown SPEC，并新增两条语言层回归测试分别锁定编号前缀和普通行内链接行为。
- 完整 `npm run check`：通过（模块边界、28 个测试文件/170 条测试、生产构建、Rust 格式和 Rust 编译）。
- 用户确认 Markdown 首轮、整页删除焦点修复及 `[1]:` 编号前缀修复均正常；本轮验收通过。
- 按项目约定更新 README：补充语法树 Live Preview、按需显形、源码模式和快捷键能力，移除尚未实现的节点链接渲染表述，并链接 Markdown SPEC。

### 2026-07-28：Markdown 链接、媒体与节点级常用语法

- 用户确认继续实现普通链接、节点链接、图片/附件预览、H4-H6 和分隔线。
- `LinkReference` 仍保持禁用；新增 `NodeLink` 语法节点识别 `[[node:<id>]]`，目标存在且未删除时显示标题并支持进入节点。
- 普通链接仅允许 `http:`、`https:`、`mailto:`；图片仅允许 `http:`、`https:`；附件必须匹配 Store 中已登记的 `attachment://<id>`。
- 新增平台导航适配器，浏览器使用 Blob URL/新窗口，Tauri 使用 opener，并将本地打开路径限制在应用附件目录。
- H4-H6 获得独立层级样式；`HorizontalRule` 预览为水平线，点击直接进入当前节点源码模式，便于继续编辑原始 `---`/`***`。
- 新增语言、装饰器和外链安全回归测试；当前定向测试 34 条通过。
- 完整 `npm run check`：通过（模块边界、29 个测试文件/182 条测试、生产构建、Rust 格式和 Rust 编译）。
- 浏览器验证 `http://localhost:4173/`：桌面预览无横向溢出，现有 Markdown 样式正常，控制台无错误或警告；临时验证标签已关闭。

### 2026-07-28：补齐无协议域名链接

- 用户反馈 `[哔哩哔哩](bilibili.com)` 仍显示原文。
- 根因是安全导航适配器要求目标必须带显式协议；常见 Markdown 域名写法没有进入预览分支。
- `safeExternalUrl` 现在对符合域名形态的目标自动补 `https://`，显式危险协议仍拒绝；新增适配器回归测试并同步更新 Markdown SPEC。
- 复测发现光标仍位于链接末尾时，边界显形规则会再次覆盖安全目标；移除 Link/Image/NodeLink 的边界显形例外，链接预览现在输入完成后立即稳定显示。

### 2026-07-28：节点链接标题补全与父节点行首回车

- 用户反馈手写节点 ID 不符合实际使用习惯；新增 CodeMirror 补全，输入 `[[` 后按标题筛选，候选显示重名节点的父级路径，选择后写入稳定 ID。
- 用户反馈展开父节点行首按 Enter 会把父节点拆到首个子节点；新增 `before` 拆分位置，仅在光标位于行首且没有选中文本时创建上方同级空节点，原父节点和子树保持不变。
- 新增领域命令、Store 和编辑器层回归测试；节点链接仍保持原有持久化格式，无数据迁移。
- 修复补全范围把开头 `[[` 当成候选筛选文本的问题；现在 `[[` 仅打开候选，后续标题才参与筛选，选择结果保留开头括号。

### 2026-07-28：始终预览语法的可见光标语义

- 用户确认粗体、斜体等会在光标进入时回显原文，现有移动符合直觉；问题只存在于普通链接、节点链接、图片、附件、待办框和分隔线等始终隐藏源码的元素。
- Markdown 装饰插件为始终隐藏的范围提供 CodeMirror `atomicRanges`：普通链接仅将隐藏前后缀设为原子范围，标题仍可逐字编辑；组件型语法将完整原文设为原子范围。
- 跨节点导航按可见首尾判断，链接位于节点边界时无需额外按一次方向键；源码模式不启用这些原子范围。
- 新增可见删除命令，普通链接边界删除只作用于相邻可见字符并保留 URL，完整组件按整体删除。
- 新增移动、源码模式、跨节点边界与删除回归测试；数据格式、Store、SQLite 和同步协议保持不变。
- 完整 `npm run check` 通过（模块边界、29 个测试文件/192 条测试、TypeScript/Vite 构建、Rust 格式与编译）。
- 浏览器实测 `[站点](https://example.com)tail`：方向键按可见字符从链接标题进入 `tail`，隐藏地址不再产生额外停顿；验证数据已恢复。
- 用户复测指出原子组件的方向键存在非对称边界：从组件移出一次完成，从外部移入需要两次；增加组件边缘的显式左右移动命令，使两个方向都一次跨过，并保证该命令先于跨节点导航执行。
- 分隔线按用户要求退出原子范围，仅保留视觉替换与原有点击编辑行为。
- 用户继续反馈网页链接的半原子结构仍导致双向移动需要额外按键，并确认网页链接应整体原子化。
- 普通网页链接改为完整 `ExternalLinkWidget`：组件前后各一个光标位置，双向一次跨过；单击只显示“打开 / 修改”菜单，`Ctrl/Cmd+单击`直接打开。
- “修改”菜单提供标题和地址输入，原位重写 Markdown；标题、地址做 Markdown 转义，地址仍经安全协议校验。旧的标题可直接编辑和两段隐藏源码实现已删除。
- 用户实测发现链接菜单鼠标事件被 CodeMirror 接管且视觉上透出后方节点；`ExternalLinkWidget` 改为忽略编辑器事件，菜单内部阻止鼠标事件冒泡，打开时提升所在树行层级。菜单与表单强制白色不透明背景和指针命中。
- 用户指出分隔线虽已移出 `atomicRanges`，方向键仍整体越过。根因是 `Decoration.replace` 本身也将整段源码映射成单个替换组件。分隔线改为保留原始字符位置的普通标记装饰：预览时用透明原文承载横线，光标进入时回显源码，方向键按字符移动；旧 `HorizontalRuleWidget` 删除。
- 用户要求格式原文不只在控制符边界回显，而是在光标位于整个语法范围内时回显。显形判定改为语法节点范围命中；嵌套格式仍按最短范围优先，只显示最内层原文。链接等完整原子组件不参与此规则。
- 完整 `npm run check` 通过（模块边界、29 个测试文件/194 条测试、TypeScript/Vite 构建、Rust 格式与编译）。

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

## 2026-07-28：页面级连续可编辑画布

### 用户确认与范围

- 用户确认采用 Tana 式“原子节点 + 连续可编辑画布”方向：不把整棵树改成单一 `contenteditable`，节点继续保留独立 ID、Markdown、Store 操作和同步边界。
- 页面级协调层只负责把空白区域的点击落到正确的节点编辑器或页面级 GhostEditor；不改变节点拆分、合并、移动和同步语义。

### 实现

- 将树列表点击处理提升到 `src/features/notebook/NotebookPanel.tsx` 的页面级 `onContentAreaClick`，避免 `.tree-list` 与 `.content-area` 双重处理。
- 节点横向空白与布局间隙继续通过 `treeBlockAtPoint` 聚焦最近树块；树末尾及页面其他空白回退到当前页面 `rootId` 的 GhostEditor。
- 排除按钮、输入框、链接、附件、折叠按钮、层级线和 CodeMirror 等交互目标，搜索页与回收站不启用画布处理。
- 为可编辑视图增加 `.content-area.is-editable-canvas { cursor: text; }`，让空白区域的可编辑性与实际焦点行为一致。

### 验证

- 定向测试通过：`src/features/notebook/NotebookPanel.test.tsx`、`src/components/treeHitTesting.test.ts`，共 25 条测试。
- 新增回归覆盖：树末尾/页面空白聚焦页面 GhostEditor；搜索页和回收站不启用连续画布。
- 完整 `npm run check`：通过（模块边界、31 个测试文件/215 条测试、生产构建、Rust 格式和 Rust 编译）。
- README 暂不更新，待用户实际确认画布点击、编辑和只读视图均符合预期。

### 左右画布补充

- 用户复测指出左右两侧仍是死区；根因是 `.content-area` 本身限制为 `860px`，左右区域不在点击 DOM 内。
- `.content-area` 改为全宽滚动画布，新增 `.content-canvas-inner` 保留 `860px` 内容列；页面级点击处理继续挂在外层，左右空白现在与底部空白使用相同的页面 GhostEditor 落点。
- NotebookPanel 回归测试补充外层全宽画布与内层约束结构断言。

### 横向命中补充

- 用户继续复测发现左右区域仍像死区；根因是 `treeBlockAtPoint` 默认同时限制 X/Y 在树列矩形内，侧边点击无法命中同一纵向节点。
- 页面画布调用改为只按 Y 命中树块，保留树列内部调用的严格 X/Y 边界；点击侧边与对应节点同一行时聚焦该节点，行外空白仍聚焦页面 GhostEditor。
- 新增树命中纯函数测试和 NotebookPanel 侧边点击回归测试。

### 连续光标投影修正

- 用户指出“整页有响应”不等于“整页编辑”；此前左右侧边只按 Y 找节点并统一落到节点末尾，空间映射不连续。
- 页面画布现在使用 CodeMirror `posAtCoords` 将空白点击投影到对应视觉行的真实文档位置：左侧映射视觉行开头，右侧映射视觉行末尾，自动兼容换行与 Markdown 原子组件。
- 根节点标题纳入同一坐标投影；标题与第一树行之间的空白按纵向距离选择最近目标，只有最后树块下方才落到页面 GhostEditor。
- 回归测试验证根标题侧边、标题下方空白、普通节点左右侧边及 CodeMirror 实际 selection。

### 画布焦点转移时序修复

- 用户复测发现点击整页画布时，当前 CodeMirror 会先失焦，再把焦点落到目标节点或页面 GhostEditor，造成 Live Preview 短暂切换和视觉闪动。
- 根因是画布协调原先依赖 `click`；浏览器在 `pointerdown` 之后、`click` 之前已经执行默认焦点转移，因此页面级处理来不及阻止中间失焦。
- `src/features/notebook/NotebookPanel.tsx`：空白画布改在主按钮 `pointerdown` 阶段解析目标，并对自定义焦点转移调用 `preventDefault()`；编辑器、按钮、链接、输入框、层级线等原生交互目标继续放行。
- `src/features/notebook/NotebookPanel.test.tsx`：既有画布落点用例迁移到真实 `pointerdown` 路径；新增回归测试，确认事件默认行为已取消，且旧编辑器发生 blur 时页面 Ghost 目标已经激活。
- 相关结构与 SPEC 索引仍由 `docs/PROJECT_INDEX.md` 中“页面级连续可编辑画布落点”条目覆盖，无需新增模块或索引项。

### 验证补充

- 定向测试通过：`src/features/notebook/NotebookPanel.test.tsx`、`src/components/treeHitTesting.test.ts`，共 30 条测试。
- 完整 `npm run check`：通过（模块边界、31 个测试文件/216 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- README 暂不更新，待用户实际验收本轮焦点时序修复后再更新。

### 节点范围选择与编辑焦点所有权修复

- 用户复测发现从空节点开始形成节点范围选择后，再点击该空节点时插入光标不出现；空节点只是最稳定的触发条件，根因不是空内容本身。
- 根因是节点范围选择已经接管键盘与选择样式，但原 CodeMirror 仍保留 DOM 焦点；退出范围选择时再次点击同一编辑器不会产生完整的焦点交接，导致编辑器逻辑焦点与可见光标状态不一致。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：节点范围选择首次成立时，折叠编辑器文本选区并把 DOM 焦点统一转移到画布容器；节点选择期间由画布持有键盘焦点。
- 将上述模式切换收敛为 `enterNodeSelectionMode`：统一表达“清理 CodeMirror/DOM 文本选区并由画布接管焦点”；拖动期间和 pointerup 后抵消 CodeMirror 文档级监听的防御性清理仍独立保留。
- `src/features/notebook/NotebookPanel.tsx`：画布增加 `tabIndex={-1}`，仅提供程序化焦点落点，不进入正常 Tab 顺序，也不改变画布空白的 pointerdown 坐标投影。
- 点击任意 `InlineEditor` 时仍由捕获阶段同步清除节点选择，并放行 CodeMirror 原生 pointer/mouse 处理，使空内容和非空内容使用同一套焦点与光标恢复路径；未增加空节点特判。
- `src/features/notebook/NotebookPanel.test.tsx`：新增参数化回归测试，覆盖空内容与非空内容，验证节点选择成立后画布持有焦点、点击编辑器后选择清除且 CodeMirror 恢复真实 DOM 焦点和折叠光标。
- 项目结构与 SPEC 索引仍由 `docs/PROJECT_INDEX.md` 的“文本到节点的渐进范围选择”和“页面级连续可编辑画布落点”条目覆盖，无需新增索引项。

### 验证补充

- 定向 `NotebookPanel` 测试通过：1 个测试文件/30 条测试。
- 完整 `npm run check`：通过（模块边界、31 个测试文件/218 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- README 暂不更新，待用户实际验收本轮焦点所有权修复后再更新。

### 节点布局越界选择与整页侧边命中

- 用户指出原手势必须纵向进入其他节点后才能形成节点选择，且指针进入页面左右两侧后范围选择停止响应；确认采用 Tana 式“节点内部选文字、拖出节点布局选节点”的交互。
- 升级边界采用树行既有的逻辑节点几何：左侧为 `--tree-object-left`，右侧扣除 `--tree-row-right-padding`；不以 CodeMirror 内容宽度为准，避免空内容、换行和 Markdown 原子组件改变手势语义。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：指针横向越过起始节点布局时，即使纵向仍在原行，也进入节点选择并选中当前节点。
- 节点选择模式成立后，坐标命中允许超出树列横向边界，并将节点间布局间隙归给纵向最近节点；因此指针在页面左侧或右侧均可继续上下扩展范围。
- 指针仍位于起始节点布局内时不升级模式，CodeMirror 的普通横向文本选择保持不变。
- `src/features/notebook/NotebookPanel.test.tsx`：覆盖向左/向右越界选择单节点、从一侧进入并在另一侧纵向扩展多节点，以及节点布局内横向拖动仍保留文本选择。
- `docs/编辑规范.md`：补充上述指针手势规范；项目结构与 SPEC 索引继续由 `docs/PROJECT_INDEX.md` 的“文本到节点的渐进范围选择”条目覆盖。

### 验证补充

- 定向 `NotebookPanel` 测试通过：1 个测试文件/34 条测试。
- 完整 `npm run check`：待本轮执行后补记。
- README 暂不更新，待用户实际验收本轮侧边节点选择手势后再更新。

### 可逆文字/节点拖选补充

- 用户对照 Tana 后确认：从编辑器内容开始拖动、越过节点布局形成节点选择后，应允许在松手前拖回起始节点布局，恢复为文字选择。
- `src/features/notebook/hooks/useNodeRangeSelection.ts`：将拖动升级改为可逆预览状态。节点预览期间保留起始 CodeMirror、逻辑文字选区和编辑焦点，仅显示节点范围；拖回起始节点布局立即撤销节点预览。
- CodeMirror 的文档级鼠标监听可能在节点预览期间改写选区，因此保存进入预览时的选区快照，并在预览鼠标事件、拖回或取消时恢复；不做内容类型特判，也不引入坐标重建。
- 只有在节点预览状态 `pointerup` 时才折叠文字选区并把焦点交给画布；在文字状态松手保留 CodeMirror 选区。`pointercancel` 只撤销预览，不提交节点选择。
- `src/App.css`：节点预览存在时统一隐藏 CodeMirror 文字高亮，逻辑选区仍保留，避免文字与节点同时高亮。
- `src/features/notebook/NotebookPanel.test.tsx`：覆盖预览时保留/提交时清理、空节点、换行内容、跨节点后拖回、左右越界提交，以及提交后空/非空编辑器重新聚焦。
- 项目结构与 SPEC 索引继续由 `docs/PROJECT_INDEX.md` 的“文本到节点的渐进范围选择”条目覆盖，无需新增索引。

### 验证补充

- 定向 `NotebookPanel` 测试通过：1 个测试文件/37 条测试。
- 完整 `npm run check`：通过（模块边界、31 个测试文件/225 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。

### Ctrl 快捷键统一输入菜单与光标定位

- 用户确认采用“单独按下并松开 `Ctrl`”作为统一输入菜单快捷键；组合键继续保留原有编辑器语义，中文输入法不使用 `/` 作为入口。
- `src/components/EditorCommandMenu.tsx`：把菜单状态改为带锚点的弹层状态。单独 `Ctrl` 松开时读取 CodeMirror 当前光标坐标，点击 `+` 时读取按钮矩形；两种入口共用菜单内容、搜索和执行逻辑。
- 菜单通过 `createPortal` 挂到 `document.body`，使用 `position: fixed`，避免树行动画、裁剪和祖先变换影响定位。`calculateCommandMenuPosition` 负责下方空间不足时翻到光标上方，以及左右边缘收进视口。
- `Ctrl` 只有在编辑器或菜单拥有焦点时才会预备；按下期间出现其他按键、指针点击、窗口失焦或输入法 composing 都会取消，因而 `Ctrl+B/Z/C` 等组合键不会误开菜单。菜单打开时再次单独松开 `Ctrl` 可关闭。
- 菜单支持直接搜索、上下键循环选择、`Enter` 执行、`Esc` 关闭；当前项提供明确选中态。文件入口仍保持单一“插入文件”动作。
- `src/components/EditorCommandMenu.test.ts` 与 `src/components/InlineEditor.test.tsx`：覆盖光标定位、上下翻转、左右收边、Ctrl 开关、组合键排除、搜索 Enter 执行和焦点恢复。
- 验证：`npm run check` 通过（模块边界、36 个测试文件/266 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告，`git diff --check` 无空白错误。
- README 暂不更新，待用户实际验收本轮快捷键和弹层定位后再按项目约定同步当前能力。

### Ctrl 菜单键盘焦点修正

- 用户实际验收发现：菜单虽然显示，但输入字符和方向键仍作用于笔记，没有进入菜单搜索框。
- 根因是菜单首次挂载时需要先以 `visibility: hidden` 测量尺寸；旧逻辑在隐藏阶段调用搜索框 `focus()`。jsdom 接受该聚焦，因此原测试通过，但 Chromium/Tauri 会拒绝聚焦不可见控件，键盘焦点继续留在 CodeMirror。
- `src/components/EditorCommandMenu.tsx`：把自动聚焦改为两阶段时序，先完成菜单测量和视口定位，菜单可见后再在 layout effect 中同步聚焦搜索框；关闭菜单时同步清除待聚焦标记。
- `src/components/InlineEditor.test.tsx`：新增键盘所有权回归，确认菜单已完成定位并可见后搜索框才拥有焦点，搜索输入和方向键不会改变原笔记内容。
- 定向验证通过：`src/components/EditorCommandMenu.test.ts` 与 `src/components/InlineEditor.test.tsx`，共 27 条测试。
- 完整 `npm run check` 通过（模块边界、36 个测试文件/267 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- README 继续暂不更新，待用户重新验收本轮焦点修正后再按项目约定同步。

### Ctrl 菜单定位稳定性与关闭焦点修正

- 用户继续验收发现：输入搜索内容后菜单位置会变化，关闭菜单后编辑器焦点丢失。
- 根因一是菜单定位 layout effect 依赖搜索内容和文件状态；筛选导致菜单高度改变时会用新高度重新计算上下翻转位置。现改为每次打开只按完整菜单尺寸定位一次，本次打开期间筛选结果变化不再移动弹层。
- 根因二是关闭菜单只卸载搜索框，没有明确归还焦点。`src/components/EditorCommandMenu.tsx` 现在区分关闭原因：`Ctrl`、`Esc`、再次点击 `+`、执行命令和文件流程结束会把焦点恢复到原 CodeMirror；点击菜单外部则尊重用户点击的新目标，不抢回焦点。
- `src/components/InlineEditor.test.tsx`：新增可变菜单高度回归，锁定搜索前后 `left/top` 不变；覆盖 `Esc` 和再次单独 `Ctrl` 关闭后编辑器恢复焦点。
- 定向验证通过：`src/components/EditorCommandMenu.test.ts` 与 `src/components/InlineEditor.test.tsx`，共 28 条测试。
- 完整 `npm run check` 通过（模块边界、36 个测试文件/268 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- README 继续暂不更新，待用户实际验收本轮两项修正后再按项目约定同步。

### Ctrl 菜单改为光标邻边锚定

- 用户指出固定菜单左上角并不合理：菜单位于光标上方时，筛选导致高度缩短会在菜单与光标之间留下大片空白。
- `src/components/EditorCommandMenu.tsx`：定位结果显式记录 `above/below` 放置方向。首次打开按完整菜单尺寸决定显示方向，后续筛选只重新计算同方向的位置，不允许菜单因高度变化跨到光标另一侧。
- 菜单位于光标下方时固定顶边与光标的间距；位于光标上方时固定底边与光标的间距。筛选结果变少时菜单向锚点收缩，始终贴近当前光标或 `+` 按钮。
- `src/components/EditorCommandMenu.test.ts` 与 `src/components/InlineEditor.test.tsx`：覆盖上方菜单缩短后底边保持锚定、横向位置不变，以及关闭后编辑器焦点恢复。
- 定向验证通过：2 个测试文件/29 条测试。
- 完整 `npm run check` 通过（模块边界、36 个测试文件/269 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- README 继续暂不更新，待用户实际验收本轮锚定行为后再按项目约定同步。

### Markdown 菜单格式显示与结构光标修正

- 用户发现两个问题：菜单插入删除线后看不到 `~` 控制符；标题、引用、待办等“结构”命令插入或移除前缀后光标位置不正确。
- `src/components/markdown/markdownDecorations.ts`：Live Preview 的边界显示从“仅空光标”扩展为“空光标或当前选区位于格式语法范围内”时显示控制符。选中的文本被加上 `~~`、`**` 等标记后，源码控制符保持可见，避免用户误以为命令没有插入。
- `src/components/markdown/markdownCommands.ts`：块级前缀命令现在显式按前缀增删长度映射全部 CodeMirror 选区；添加标题/引用/待办前缀时光标和选区右移，移除时左移并在前缀内部安全收敛到文档开头。
- `src/components/markdown/markdownCommands.test.ts`、`src/components/markdown/markdownDecorations.test.ts`、`src/components/InlineEditor.test.tsx`：覆盖结构前缀映射、选中删除线控制符显示以及菜单真实执行后的编辑器状态。
- 验证：完整 `npm run check` 通过（模块边界、36 个测试文件/272 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- README 暂不更新，待用户实际验收本轮 Markdown 命令行为后再按项目约定同步。

### 删除线输入法组合输入稳定性

- 用户复测发现：插入删除线后开始中文输入时，候选框只闪现后消失，输入内容和落点也会异常。
- 根因是输入法 composition 期间 Live Preview 仍随语法树变化隐藏 `~~` 标记并建立/拆除原子范围；这会改写 contenteditable DOM，浏览器将其视为 composition 目标变化并结束输入法组合。
- `src/components/markdown/markdownDecorations.ts`：构建装饰时读取 `EditorView.composing`。composition 活跃期间临时按源码模式处理，保留原始 Markdown 和可编辑位置，不创建隐藏标记、组件替换或原子范围；composition 结束后由焦点/文档更新恢复 Live Preview。
- `src/components/markdown/markdownDecorations.test.ts`：新增 compositionstart/输入/compositionend 回归，确认 `~~~~` 中输入中文后原始 `~~中文~~` 保持稳定。
- README 暂不更新，待用户实际验收输入法行为后再按项目约定同步。

### 格式标记统一语义更正

- 用户澄清：删除线 `~~` 不需要特殊可见性，必须和粗体、斜体、高亮、行内代码完全使用同一套语法预览规则。
- `src/components/markdown/markdownDecorations.ts`：恢复 `StrikethroughMark` 与其他格式标记共用通用隐藏标记；所有格式控制符统一使用普通非原子标记，真正的链接/附件组件才使用替换和原子范围。
- `src/components/markdown/markdownDecorations.test.ts`、`docs/MARKDOWN_SPEC.md`：回归为统一格式语义，确认删除线隐藏控制符但不进入原子范围。
- 验证：完整 `npm run check` 通过（模块边界、36 个测试文件/273 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- README 暂不更新，待用户实际验收删除线和中文输入后再按项目约定同步。
- 用户实际验收通过：节点预览期间内容选区高亮正确隐藏，拖回起始节点后文字选区正确恢复。
- 按项目约定同步更新 `README.md` 的当前能力，补充连续可编辑画布与可逆的文字/节点渐进范围选择。

### 附件导入改为桌面原生路径链路

- 用户明确本项目定位为本地优先桌面 app，不需要浏览器兼容，也不需要二进制 IPC 兜底；附件导入应使用 app 自己的存储目录。
- `src-tauri/tauri.conf.json`：恢复 `dragDropEnabled`，启用 Tauri 原生文件拖放事件。
- `src-tauri/src/lib.rs`、`src-tauri/src/attachments.rs`：新增 `save_attachment_from_path` 命令。Rust 从源路径分块读取，在同一遍读取中计算 SHA-256 并复制到 app 附件目录，临时文件同步落盘后原子改名；返回名称、MIME、大小、哈希和本地路径。
- `src/platform/nativeAttachments.ts`：使用 Tauri dialog 选择本机路径，并监听原生拖放路径。
- `src/platform/attachments.ts`、`src/store/useNotebookStore.ts`、`src/components/InlineEditor.tsx`：附件状态改为路径来源，前端不再调用 `File.arrayBuffer()`，也不再创建 Blob URL 或走浏览器兜底。
- `src/components/EditorCommandMenu.tsx`：插入文件改为原生多选路径；剪贴板文件提示使用桌面拖放或插入文件入口。
- 测试已迁移至路径语义，覆盖原生选择、多文件顺序、目标行拖放、错误重试、剪贴板拒绝和 Store 元数据写入。
- 验证：定向附件测试 2 个文件/44 条测试通过；完整 `npm run check` 通过（模块边界、35 个测试文件/260 条测试、生产构建、Rust 格式和 Rust 编译）。Vite 仅提示既有的 editor chunk 超过 500 kB 警告。
- 用户实际验收通过：桌面路径附件导入符合预期。
- 按项目约定同步更新 `README.md`，明确附件通过桌面原生多选和资源管理器拖放导入，并复制到应用附件目录，导入后不依赖原文件。

### 减少缩进的页面边界

- 用户发现当前页面的直接子级执行减少缩进后仍会生效；预期页面根应是提升操作不可跨越的边界。
- 根因是 `outdentNode` 只依据持久化父链移动节点，不知道当前活动页面根；在具体笔记页会把直接子级移出页面，在工作区根页面还可能因相对虚拟根计算而改变顺序。
- `src/domain/commands/moveNode.ts`：`outdent` 命令显式携带 `boundaryRootId`；目标节点的父节点等于页面根时返回原状态，更深层节点继续沿用原提升规则。
- `src/store/useNotebookStore.ts`：调用提升命令时传入操作发生时的 `activeRootId`；被拒绝的操作不持久化、不追加操作日志。
- `src/domain/commands/nodeCommands.test.ts` 与 `src/store/useNotebookStore.test.ts`：覆盖页面直接子级保持原父节点、命令报告无变化且 Store 不新增操作日志。
- `docs/DOMAIN_RULES.md`：补充当前页面根不可跨越的提升边界。项目结构与 SPEC 索引不变，继续由领域命令和 Store 既有索引覆盖。
- README 暂不更新，待用户实际验收本轮修复后按项目约定处理。

### 验证补充

- 定向测试通过：`src/domain/commands/nodeCommands.test.ts` 与 `src/store/useNotebookStore.test.ts`，共 35 条测试。
- 完整 `npm run check`：通过（模块边界、32 个测试文件/231 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- 用户实际验收通过：页面直接子级减少缩进保持不动，页面内更深层节点仍可正常提升。
- 按项目约定同步更新 `README.md`，明确提升操作不能越过当前页面根。

### 页面前进与后退导航

- 用户确认需求只针对页面导航变化：例如从“主页 / 所有笔记”进入“主页 / 设置”后，可返回所有笔记并再次前进到设置；不扩展为编辑记录或持久化浏览历史。
- `src/app/navigationHistory.ts`：新增启动周期内的纯页面历史，位置由当前 `WorkspaceView` 与面包屑根节点 ID 组成；相同位置不重复入栈，后退后产生新导航时清除原前进分支。
- `src/app/AppShell.tsx`：统一记录侧栏、主页入口、设置入口和具体笔记根节点的页面变化；恢复历史时复用既有异步面板加载流程，并避免把恢复动作重新写入历史。
- `src/app/components/TopBar.tsx` 与 `src/App.css`：顶部面包屑左侧新增前进、后退图标按钮，无法使用时显示禁用态；支持 `Alt+左方向键` 和 `Alt+右方向键`。
- `src/app/navigationHistory.test.ts`、`src/app/AppShell.test.tsx`、`src/app/components/TopBar.test.tsx`：覆盖历史移动、去重、分支清理、按钮状态及“所有笔记 → 设置 → 后退 → 前进”集成流程。
- 应用内浏览器实测：初始按钮均禁用；进入所有笔记再进入设置后，后退按钮正确启用，页面面包屑与设置内容正确显示。
- 用户实际验收通过；按项目约定同步更新 `README.md` 当前能力，并在 `docs/PROJECT_INDEX.md` 增加导航历史实现与回归入口。

### 验证补充

- 导航定向测试通过：3 个测试文件/6 条测试。
- 生产构建通过；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- 完整 `npm run check`：通过（模块边界、32 个测试文件/229 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。

### 浏览器默认视觉统一

- 用户发现节点范围选择松手后笔记页出现黑边；根因是选择提交时画布按既有焦点所有权规则获得程序化焦点，而带 `tabIndex={-1}` 的 `.content-area` 没有覆盖浏览器默认焦点轮廓。
- `src/App.css`：移除画布的默认焦点轮廓，不改变节点选择提交、键盘焦点归属或 CodeMirror 行为。
- 统一按钮的原生外观与禁用光标，移除移动端点击高亮；可交互控件继续保留键盘 `:focus-visible`，但改用应用叶绿色焦点标识，节点圆点与层级线沿用其已有专属反馈。
- 将可编辑文本的浏览器默认选区色、设置输入框自动填充底色以及 Chromium/Firefox 默认滚动条替换为应用色；保留文本选择、密码管理、自动填充和滚动能力。
- 未使用全局 `outline: none` 取消所有反馈，也未隐藏滚动条，避免破坏键盘可访问性与滚动可发现性。
- README 暂不更新，待用户实际验收默认视觉清理后再决定是否记录为用户可见能力。

### 验证补充

- 完整 `npm run check`：通过（模块边界、32 个测试文件/229 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。
- 应用内浏览器实测：`.content-area` 获得焦点后的计算样式为 `outline-style: none`，画布黑边消失；普通按钮通过键盘聚焦时仍显示应用叶绿色焦点轮廓。
- 浏览器控制台无警告或错误。
- 用户实际验收通过：画布焦点黑边及其他浏览器默认视觉清理均符合预期。
- 按项目约定同步更新 `README.md`，补充统一控件视觉与保留键盘焦点反馈。

### 节点预览文字高亮修正

- 用户复测发现进入节点选择预览后仍能看到内容文字选区高亮。
- 根因是此前只隐藏了 CodeMirror 自绘的 `.cm-selectionBackground`；页面后部的普通 `.cm-editor ::selection` 规则仍会绘制浏览器原生文字选区。
- `src/App.css`：在普通选区样式之后同时覆盖浏览器原生 `::selection` 与 CodeMirror 自绘选区层，节点预览时两者均透明；拖回内容选择后随 `has-node-selection` 移除而恢复。
- 现有 `NotebookPanel` 回归继续锁定节点预览状态类的进入与移除；生产构建用于确认最终 CSS 规则及顺序正常生成。
- 后续审查确认选区视觉此前同时定义在 `src/components/editorTheme.ts` 与 `src/App.css`，职责重复。现已移除主题内的硬编码选区颜色，由 `App.css` 的 `--editor-selection-background` 统一驱动原生 `::selection` 与 CodeMirror 自绘层；节点预览只把该变量切为透明。
- 保留浏览器和 CodeMirror 的选择、输入法、剪贴板及无障碍能力，仅统一接管视觉表现；不使用全局 `user-select: none` 破坏编辑能力。
- 项目结构与 SPEC 索引不变，继续由 `docs/PROJECT_INDEX.md` 的“文本到节点的渐进范围选择”条目覆盖；用户验收后已同步更新 README。

### 验证补充

- 定向 `NotebookPanel` 测试通过：1 个测试文件/37 条测试。
- 完整 `npm run check`：通过（模块边界、31 个测试文件/225 条测试、生产构建、Rust 格式和 Rust 编译）；Vite 仅提示既有的编辑器 chunk 超过 500 kB 警告。

## 2026-08-01：自动化性能基线与回归预算

### 用户确认与范围

- 用户确认性能判断不能依赖人工主观测试，并确认先建立纯逻辑、真实浏览器交互和后续 Tauri 原生三层性能体系。
- 本轮落地前两层，保持同步与移动端不进入施工范围；Tauri WebView2、SQLite 和附件链路明确列为后续独立层，不用 Chromium 数据替代。
- 施工前确认工作区已有未提交的编辑、拖拽、菜单和文档成果；本轮未覆盖、回退或重排这些改动。

### 实现

- 新增 `performance/fixtures.ts`，确定性生成 1k/10k 大纲、1k 可展开子树和 100KB Markdown；测试只写隔离浏览器上下文的 `localStorage`，不读取真实工作区。
- 新增 `performance/domain.perf.test.ts` 与 `vitest.performance.config.ts`：预热后重复采样并以 P95 检查可见树、搜索和布局行纯逻辑预算。
- 新增 `performance/browser.perf.spec.ts` 与 `playwright.performance.config.ts`：针对生产构建自动执行启动、打开 10k 大纲、展开 1k 子节点、长 Markdown 连续输入、重复节点切换和真实指针拖拽。
- 浏览器采集操作提交耗时、Long Task 总时长、超过 34ms 的慢帧比例、实际 DOM 行数和垃圾回收后的 JS 堆增长；失败时保留 Playwright trace。
- 新增 `performance/budgets.ts` 统一管理预算，支持以 `PERF_BUDGET_SCALE` 记录固定 CI 硬件差异；新增 `performance/metrics.ts` 输出包含环境、阈值和通过状态的版本化 JSON。
- `package.json` 新增 `test:perf`、分层性能命令与专用预览服务；新增 `tsconfig.performance.json`，并把 `check:perf-types` 纳入常规 `npm run check`，避免独立性能源码逃过类型检查。
- `.gitignore` 忽略 `performance-results/` 本机产物；新增 `docs/PERFORMANCE.md` 并更新 `docs/PROJECT_INDEX.md` 的 SPEC、实现和验证入口。
- README 暂不更新，按项目约定等待用户确认本轮性能测试有效无误后再更新。

### 首轮基线

- 纯逻辑 P95：1k 可见树约 0.77ms、10k 可见树约 10.08ms、10k 搜索约 3.52ms、1k 布局行约 0.36ms。
- Chromium：应用就绪约 1.23s、打开 10k 大纲约 380ms/长任务 98ms、展开 1k 子节点约 425ms/慢帧率 6.3%，实际仅挂载 37 行。
- UTF-8 100KB Markdown 输入 P95 约 115ms，是当前最值得优先跟踪的性能指标；本轮 15 次输入未产生超过 50ms 的 Long Task。
- 12 次节点切换 P95 约 246ms，垃圾回收后 JS 堆增长约 1.29MiB；指针拖拽完成约 552ms，450ms 观测窗内未记录超过 34ms 的慢帧。
- 初始预算依据本机基线保留抖动余量后收紧；不同固定硬件必须记录缩放系数，不能通过临时放宽单项断言隐藏回退。

### 验证

- `npm run test:perf`：通过性能源码类型检查、1 个文件/4 条纯逻辑性能测试和 5 条真实 Chromium 场景，并生成 `performance-results/domain.json` 与 `performance-results/browser.json`。
- 完整 `npm run check`：通过模块边界、性能源码类型检查、39 个测试文件/317 条前端测试、生产构建、Rust 格式和 Rust 编译。
- Vite 仅提示既有的 editor chunk 超过 500 kB；`git diff --check` 无空白错误。

### 组合压力与持久化归因

- 用户确认先补组合压力测试和性能归因，不在本轮改动持久化时序或数据安全语义。
- `performance/fixtures.ts` 新增 10k 节点与 UTF-8 100KB Markdown 的组合工作区；浏览器场景在该文档中连续输入 100 次。
- 页面测试句柄在夹具写入后代理 `JSON.stringify` 与目标工作区的 `localStorage.setItem`，分别记录每次输入的全量序列化和同步存储耗时；同时输出输入 P95、Long Task 总时长和持久化占比。
- 组合指标纳入统一预算和机器可读 `browser.json`；结构性 DOM 预算继续不受硬件缩放系数影响。
- 约 2.38MB 的组合工作区首次归因显示输入 P95 约 123ms，其中全量 JSON 序列化 P95 约 10.4ms、同步 `localStorage` 写入 P95 约 11ms，二者约占输入 P95 的 21.7%。
- 重复运行输入 P95 约 127.9～138.3ms，同步持久化 P95 约 25.1～28.4ms；100 次输入对应 100 次全量序列化和 100 次同步写入，持久化约占输入 P95 的 21.5%。
- 三次组合采样中 Long Task 数明显波动，已记录的两次完整计数为 48～78/100，单次 Long Task P95 均约 59ms，持续未通过“最多 30 个 Long Task”的暂定门槛。
- 该失败保留为真实性能问题，不通过放宽预算伪造成功；下一步需要用户确认是否实施有界持久化批处理及强制落盘策略。
- README 暂不更新，等待用户确认本轮归因结果后按项目约定处理。

## 2026-08-01：经典增量持久化架构设计

### 用户确认与审计

- 用户确认不采用 `localStorage` 恢复日志或延迟全量快照等过渡方案，直接设计 SQLite/IndexedDB 按实体增量持久化与操作日志的经典结构。
- 当前 SQLite 只有单行 `workspace_state.state_json`、操作日志和附件元数据表；每次 Tauri 命令重新打开数据库，未显式启用 WAL 或复用连接。
- 浏览器工作区只有单个 localStorage JSON；Tauri 启动时通过浏览器与原生快照时间戳竞争选取数据。
- 领域命令目前主要返回完整新状态，部分移动结果只报告移动根节点，Repository 若直接接入只能扫描 10k 实体猜差异，因此精确变更集是经典增量方案的必要前置。
- 当前每个按键立即创建包含完整 Markdown 的 `update_markdown` 操作；仅改状态表而不合并未落盘操作仍会产生大量 IPC 与日志数据。

### SPEC 设计

- 新增 `docs/PERSISTENCE_SPEC.md`，定义领域 `NotebookChangeSet`、Store 耐久级别、200ms/1000ms 内容提交窗口、同节点 Markdown 操作合并和 immediate 结构事务。
- SQLite v2 采用 nodes、node_fields、attachments、node_view_state、recent_page_edits、operations 和 workspace_meta 实体表；启用 WAL、外键、NORMAL synchronous、busy timeout 和复用连接。
- Tauri 通过单个增量 mutation 命令原子提交状态实体与操作日志；浏览器 IndexedDB 使用对应对象仓库和同一 Repository 合同。
- 迁移从旧 SQLite/localStorage 快照中选择最新合法版本，一次事务导入 v2；迁移成功后不双写旧格式，只读保留旧快照一个稳定版本。
- 明确附件文件/数据库两阶段处理、失败队列、操作压缩边界、实施顺序、合同测试、迁移测试与组合性能完成标准。
- `docs/ARCHITECTURE.md`、`docs/PROJECT_INDEX.md` 和 `docs/PERFORMANCE.md` 已同步目标边界与当前已知红线。
- README 暂不更新；本轮仅冻结架构，不宣称增量持久化已经实现。

### 客户端数据库选型确认

- 用户询问 PostgreSQL 是否更适合当前 App。结论是当前瓶颈来自全量快照写入，而非 SQLite 引擎；替换为独立数据库服务不能解决全量序列化，并会增加安装、进程、端口、鉴权和未来移动端复杂度。
- 用户确认客户端继续采用 SQLite/IndexedDB：Tauri 本地状态使用 SQLite，浏览器预览使用 IndexedDB；PostgreSQL 只保留为未来自建同步服务器的候选存储，不允许客户端直连。

### 放弃开发期旧数据兼容

- 用户明确当前没有任何需要保留的有效数据，因此取消旧 SQLite/localStorage 快照选择、解析、导入、只读保留和降级支持。
- SPEC 改为目标 schema 不匹配时限定范围重建：Tauri 删除明确的 notebook SQLite 主文件及 WAL/SHM，浏览器删除旧工作区键和非目标 IndexedDB，再用领域 seed 初始化。
- 重建不得删除设备 ID、凭据和其他设置；附件目录不随数据库文件直接递归删除，孤儿附件由维护任务按明确目标处理。
- 用户进一步确认本轮“完全不用考虑旧数据兼容”：旧格式不再被视为实现输入，不读取内容、不迁移、不双写、不提供降级；仅对明确的工作区存储目标执行开发期 schema 重建。
- `AGENTS.md`、`docs/PERSISTENCE_SPEC.md` 与 `docs/ARCHITECTURE.md` 已统一此规则，避免后续实现重新引入兼容分支；正式发布后的升级策略不属于本轮 SPEC，届时另行设计。
- `docs/PROJECT_INDEX.md` 已同步“不读取旧数据”的 SPEC 定位；文档施工后 `git diff --check` 通过，历史日志中的旧迁移提案作为被后续决策推翻的过程记录保留，不代表当前方案。
- 架构实施前按用户要求建立干净 Git 基线；提交前 `npm run check` 通过模块边界、性能源码类型、39 个测试文件/317 条测试、生产构建、Rust 格式和 Rust 编译，仍只有既有 editor chunk 体积提示。

## 2026-08-02：App 性能路线独立审查

### 审查范围

- 用户要求不预设现有方案正确，审视 App 中应简化、优化或推翻重做的性能路径；本轮只做只读诊断、自动化采样和文档结论，不修改业务代码。
- 修改前 `git status --short` 为空；本轮性能命令生成的 `performance-results/` 与 `dist/` 均为既有忽略项。

### 动态证据

- `npm run test:perf:domain` 通过 4 项；10k 可见树 P95 为 18.80ms，虽低于现有 50ms 预算，但已经超过 16.7ms 单帧时间。
- 完整浏览器回归在 100KB Markdown 场景失败：输入 P95 362.30ms，超过 200ms 预算；由于 Playwright serial 模式，后续 3 项被跳过。
- 独立运行组合场景：输入 P95 144.60ms，全量持久化 P95 25.20ms、占比 P95 21.95%；100 次输入产生 59 个 Long Task，累计 3504ms。
- 独立运行节点切换与 40 节点拖拽均通过；拖拽完成 404.90ms、慢帧比 0。该小夹具不能覆盖源码中拖拽开始后关闭虚拟化的 10k 行退化。
- 生产构建成功；editor chunk 525.84kB（gzip 182.28kB），保留既有大 chunk 警告。

### 架构结论

- 当前输入把局部字符编辑扩散为完整实体字典克隆、全节点 revision 扫描、完整工作区同步序列化/写入、全局 Zustand 订阅失效、可见树/布局行/布局签名重算和 Markdown 全语法树装饰重建。
- 现有增量持久化 SPEC 的 SQLite/IndexedDB 实体化方向保留，但单独实施只能消除当前已测约 22% 的持久化成本；实施前必须把 ChangeSet 扩展为内存局部更新、派生索引和视图失效的共同协议。
- 保留 React、Zustand、CodeMirror、TanStack Virtual 和 SQLite/IndexedDB 基础选型；推翻重做 Store 提交/订阅边界、Markdown Live Preview 全文重建策略和拖拽关闭虚拟化的契约。
- 新增 `docs/PERFORMANCE_AUDIT_2026-08-02.md`，记录证据、分级裁决、测试缺口和建议施工顺序；`docs/PROJECT_INDEX.md` 已加入审查文档与回归入口索引。
- README 暂不更新；本轮是审查结论，需用户确认结论有效并授权重大施工后再进入实现。

### 验证

- 文档外未修改源码；未运行与文档变更无关的完整 `npm run check`。
- 端口 4273 已确认空闲，没有遗留性能预览服务。

## 2026-08-02：性能施工第一阶段——完整观测与结构红线

### 确认边界

- 用户接受性能架构审查与建议施工顺序，授权先实施性能测试编排和观测；本阶段不修改 Store、Live Preview、持久化或拖拽业务算法。
- 按用户确认同步更新 README 的性能回归入口与当前红线说明。

### 测试基础设施

- `src/shared/performanceProbe.ts` 新增可选运行时探针；未安装探针时只做空值判断，不留生产样本。AppShell、NotebookPanel、树拓扑 useMemo、树行和 InlineEditor 输入提交记录时间戳或执行次数。
- 组合压力测试分开记录按键到 CodeMirror 提交、Store 同步提交、React/Notebook 提交的 P95，并统计 AppShell、NotebookPanel、拓扑计算和树行渲染次数。
- 性能套件不再使用 Playwright serial 失败跳过语义。所有场景先记录指标，最后由独立预算报告测试统一列出全部超限项；`afterAll` 在预算失败前写出完整 `browser.json`。
- 新增 1k/10k 大纲拖拽中 DOM 行数硬预算 100；测试在按住指针期间采样，`finally` 保证释放指针。

### 新基线

- 完整 Chromium 套件执行全部 8 个场景后统一报告 3 项红线：组合输入 Long Task `63/100`；1k 拖拽挂载 `1001` 行；10k 拖拽挂载 `10001` 行。
- 10k 拖拽从按下到预览可见约 18.29s，直接证明“拖拽时关闭虚拟化”不可接受；1k 对应约 1.70s。
- 100 次组合输入完整取得 100 份分段样本：CodeMirror 提交 P95 20.40ms、Store 同步提交 28.70ms、React/Notebook 提交 10.90ms。
- 同一轮输入产生 AppShell 渲染 100 次、NotebookPanel 渲染 100 次、树拓扑计算 100 次；树行 render 为 0，说明 memo 保护了行组件，但没有阻止父级全局重算。
- 全量工作区持久化 P95 24.00ms，占输入 P95 20.99%；该结果再次证明持久化是重要组成但不是全部输入成本。

### 验证

- `npm run check:perf-types`：通过。
- `npm run check:boundaries`：通过。
- 相关 Vitest：3 个文件、83 条测试全部通过。
- `npm run test:perf:browser`：生产构建成功，8 个场景全部执行；最终按预期因上述 3 项已知性能红线失败并生成完整 JSON。
- 性能预览端口 4273 已释放；README、性能规范和项目索引已同步。

## 2026-08-27：性能施工第二阶段——Live Preview 视口有界更新

### 用户确认与施工基线

- 用户确认第一阶段有效，并授权按六步路线进入第二阶段 Markdown Live Preview 架构施工。
- 第一阶段已单独提交为 `735ee8b`，提交前完整 `npm run check` 通过；第二阶段从干净工作区开始。
- 本阶段保留 CodeMirror 6、Lezer 增量语法树、现有 Markdown 子集和 Widget 交互语义，不改 Store、持久化或拖拽算法。

### 根因与实现

- 原插件在文档、选区、视口或焦点变化时从语法树根重建全部 DecorationSet；查找 revealed boundary 还会先额外遍历一次完整语法树。
- `src/components/markdown/markdownDecorations.ts` 新增 `markdownPreviewRanges`，把装饰扫描限制到 CodeMirror 当前可见行及上下各一行，并合并相邻范围；revealed boundary 改为只遍历当前选区接触的语法分支。
- 插件继续在文档、选区、焦点、视口和源码模式变化时更新，但每次只生成当前视口需要的格式、隐藏标记和链接/附件 Widget；离屏内容滚入视口时再生成，不再随每个字符扫描整篇文档。
- `src/shared/performanceProbe.ts` 增加 Live Preview 构建起止标记，并在开始标记中记录实际扫描字符数；生产环境未安装探针时仍只执行可选链，不保留样本。
- 没有继续增加旧 DecorationSet 映射或选区边界缓存：当前视口重建已经远低于预算，继续扩建会增加跨行语法和 Widget 一致性风险，只有分项预算再次失败时才启用下一层增量策略。

### 回归与动态证据

- `markdownDecorations.test.ts` 新增范围扩展与合并回归；Markdown 目录 5 个测试文件/75 条测试通过，现有格式显隐、源码模式、任务、链接、附件和原子编辑语义未变。
- 浏览器性能测试新增 100KB/1MB Live Preview 构建 P95 与扫描字符硬预算；构建必须不超过 34ms，扫描字符不得超过 65536，结构预算不随硬件缩放。
- 100KB 定向结果：整体输入 P95 180.70ms，Live Preview 构建 P95 0.60ms，扫描字符 P95 2694。
- 1MB 定向结果：Live Preview 构建 P95 0.30ms，扫描字符 P95 1570；整体输入 P95 598.90ms，并有 12 个 Long Task。
- 1MB 分项结果证明 Live Preview 已不制造 Long Task；剩余整体阻塞来自尚未施工的 Store/订阅失效和全量持久化路径，保留给路线第 3、5 步，不通过放宽总预算隐藏。

### 文档与后续

- `docs/PERFORMANCE.md` 已同步 1MB 场景、分项预算、完成数据和剩余红线；`docs/PROJECT_INDEX.md` 已索引视口有界实现和回归入口；目录职责未变化。
- `docs/PERFORMANCE_AUDIT_2026-08-02.md` 状态更新为第 1～2 步完成，并记录为何当前不引入更复杂的 DecorationSet 变更映射。
- README 暂不更新，等待用户实际验收本阶段有效无误后再按项目约定同步。

### 最终验证

- 完整 `npm run check` 通过：模块边界、性能源码类型、39 个测试文件/318 条测试、生产构建、Rust 格式与 Rust 编译均正常；仍只有既有 editor chunk 超过 500kB 提示。
- 1MB 场景在完整套件首轮因导航懒加载超过通用 5 秒准备等待而失败；只把该场景的准备等待明确为 30 秒，不修改任何操作耗时、Long Task 或扫描预算。复跑后 9 个业务场景全部执行成功。
- 完整浏览器结果中，100KB/1MB Live Preview 构建 P95 为 0.50ms/0.60ms，扫描字符 P95 为 2694/1570，两项新增硬预算全部通过。
- 性能总报告仍按预期失败：启动 2724.80ms、100KB 整体输入 P95 274.30ms/Long Task 累计 625ms、组合输入 Long Task 57/100，以及 1k/10k 拖拽挂载 1001/10001 行。节点切换堆增长复跑为约 1.31MiB，通过既有预算。
- 当前失败均不来自 Live Preview 分项，分别留给路线第 3 步 Store/失效边界、第 4 步拖拽虚拟化、第 5 步增量持久化和第 6 步启动生命周期处理；性能预览服务已退出。

### 验收反馈：长文多选与拖拽仍偏卡

- 用户确认本阶段 Live Preview 有效，但实测长文中的多选、拖拽仍比短文/小树更卡。
- 当前源码审计与性能红线一致：`NotebookPanel` 在拖拽开始时以 `dragId === null` 作为虚拟化条件，导致大树拖拽挂载全部行；`useNodeRangeSelection` 的指针移动会更新选择状态，`NotebookPanel` 随后重新查询并测量整批行，长行高度会放大该成本。
- 该问题不归因于 Live Preview：100KB/1MB 预览构建 P95 仍为 0.50ms/0.60ms，扫描范围为 2694/1570 字符。需要用户另行确认后进入第 3 步 Store 失效边界与第 4 步拖拽虚拟化的重大施工。

## 2026-08-27：性能施工第三/四阶段首轮——长文选择与拖拽虚拟化

### 用户确认与范围

- 用户确认进入第 3、4 步重大施工，目标是处理长文多选和拖拽比短文/小树更卡的问题。
- 本轮先做可独立验证的局部边界：不改领域命令和持久化协议；Store 的完整实体订阅重构、拖拽精确长行测量仍保留为后续阶段。

### 实现

- `src/features/notebook/hooks/useNodeRangeSelection.ts`：使用 `useMemo` 缓存节点选区的顺序数组和深度签名；节点拖选指针移动时若选区头尾未变化则保持原对象，空的附加选区数组不重复创建，避免 10k 行长列表在每个 pointermove 上重复构造基础索引。
- `src/features/notebook/NotebookPanel.tsx`：拖拽期间不再以 `dragId` 关闭虚拟化。落点布局只读取已挂载行，其余行使用 TanStack Virtual 的 `measurementsCache` 和稳定估算高度生成逻辑矩形；拖拽预览继续只渲染轻量 overlay。
- 未挂载的长行当前使用虚拟器估算高度，可能在首次测量前存在少量落点偏差；滚动进入视口后由真实行高更新缓存。精确的长行测量协议列为后续第 4 步，不伪装为本轮完成。

### 验证

- 定向 UI 测试通过：`NotebookPanel` 与 `InlineEditor` 共 2 个文件/81 条测试；性能源码类型检查通过。
- 拖拽专项浏览器测试通过：40 节点常规拖拽、1k 节点和 10k 节点拖拽全部通过；1k/10k 拖拽期间 DOM 行均为 37（预算上限 100），拖拽完成约 430ms。
- 完整 `npm run check` 通过：模块边界、性能类型、39 个测试文件/318 条测试、生产构建、Rust 格式与 Rust 编译；仍只有既有 editor chunk 超过 500kB 提示。
- 性能总套件中的 Store/持久化 Long Task、启动抖动等既有红线仍保留；本轮没有通过放宽预算隐藏。

### 后续与验收

- 第 3 步的完整 Store 内容变更/派生索引/订阅失效协议尚未施工；第 4 步还需补充长行滚动中的精确落点回归。
- 本轮 README 暂不更新，等待用户实际验收长文多选和 1k/10k 拖拽后再同步当前能力。

## 2026-08-27：节点数量场景纠偏与中等规模交互优化

### 用户反馈与诊断纠偏

- 用户明确指出：单个节点内容很长时，节点选择或拖拽并不卡；卡顿发生在同一页面存在多个节点时。此前把问题归因到长 Markdown 行高和内容长度是错误的。
- 性能场景改为 160 个短文本节点，隔离 Markdown 长度变量。审计确认原窗口化门槛为 200，导致 80～199 行的中等规模页面全部挂载；此前 40 与 1k/10k 场景恰好漏掉这一区间。
- 节点拖选过程中还会在每次选区变化时执行 `executeIndentSelection` 和 `executeOutdentSelection`，两次预演都会扫描完整节点树，但其结果仅供抬指后出现的选区菜单使用。

### 实现

- `NotebookPanel` 将窗口化门槛从 200 行下调到 80 行，使中等规模页面的节点选择、命中测试和 dnd-kit 订阅数量保持视口有界。
- `useNodeRangeSelection` 在拖选预览阶段跳过批量缩进/提升命令预演，只在选区完成且菜单可用后计算；选择语义和菜单能力不变。
- 浏览器性能回归新增 160 节点短文本范围选择，并把拖拽矩阵扩展为 160/1k/10k；选择 Long Task 和两类交互的 DOM 行数均设硬预算。

### 定向验证

- `NotebookPanel.test.tsx`：52 条测试通过；性能测试 TypeScript 检查通过。
- Chromium 专项 4 个场景通过：160 节点范围选择无 Long Task，选择和 160/1k/10k 拖拽均只挂载 37 行；最终复跑中 160 节点拖拽预览约 180ms。
- 自动化 40 步鼠标插值包含工具调度时间，因此最终复跑的选择总墙钟约 893ms 仅作诊断，不作为交互预算；结构预算和 Long Task 才作为硬门槛。
- 完整 `npm run check` 通过：模块边界、性能源码类型、39 个测试文件/318 条测试、生产构建、Rust 格式与 Rust 编译均正常；仍只有既有 editor chunk 超过 500kB 提示。
- README 暂不更新，等待用户再次实测确认本轮有效。

### 用户验收

- 用户复测确认节点数量场景“有改善”，本阶段验收有效。
- 按项目约定，`README.md` 已同步中/大节点页的窗口化、节点选择性能边界与 160/1k/10k 性能夹具说明。

## 2026-08-27：极端规模拖拽启动线性化

### 范围与根因

- 用户确认进入下一步，继续处理前一轮明确保留的 10k 节点拖拽启动红线；不改数据格式、持久化协议和拖放语义。
- 10k 拖拽虽然只挂载 37 行，但启动仍约 4.18s。根因是 `createTreeDropSlots` 为每个槽位线性扫描已有槽位，并重复复制/筛选/查找移动节点的同级列表，平铺大树形成平方级路径。
- `measuredTreeBlocks` 为每个节点重新向后寻找子树终点，深层嵌套树同样存在平方级退化。

### 实现

- `src/domain/dropSlots.ts` 使用 `Set` 维护槽位 ID，并在一次 child index 上预先计算移动节点的父级与下一同级节点；当前位置和合法性判断不再逐槽位扫描同级列表。
- `src/features/notebook/model/subtreeLayout.ts` 使用单调栈一次性确定每行对应的子树末端，保持原有输出顺序、间距和 `isSubtree` 语义。
- 纯逻辑性能回归新增 10k 拖拽槽位与 10k 深层子树矩形预算；Chromium 10k 拖拽启动从诊断项升级为 1000ms 硬预算，继续保留 100 行 DOM 上限。

### 验证

- 领域与布局定向测试：2 个文件/13 条测试通过；性能源码 TypeScript 检查通过。
- 纯逻辑性能套件 6 个场景通过：10k 槽位 P95 13.13ms（预算 100ms），10k 深层子树矩形 P95 0.35ms（预算 20ms）。
- Chromium 10k 拖拽专项通过：单场景启动 227ms，最终 160/1k/10k 完整专项矩阵中为 608ms（预算 1000ms），拖拽中 DOM 37 行（预算 100）。相较上一轮同机约 4.18s，启动等待已消除。
- README、性能规范、架构审查和项目索引已同步。
- 完整 `npm run check` 通过：模块边界、性能源码类型、39 个测试文件/318 条测试、生产构建、Rust 格式与 Rust 编译均正常；仍只有既有 editor chunk 超过 500kB 提示。
- 最终 Chromium 矩阵 4 个场景全部通过：160 节点范围选择无 Long Task，选择及 160/1k/10k 拖拽均为 37 个 DOM 行，10k 拖拽启动 608ms。

## 2026-08-27：设置页调试样例生成

### 需求与边界

- 用户要求在设置页增加调试功能：仅当工作区还没有样例笔记时，一键生成可用于各种测试的样例笔记。
- 样例使用保留的 `debug-sample-` ID 前缀识别；已有普通用户笔记不阻止生成，已有样例（包括已进入回收站的样例）不会被覆盖或重复生成。
- 生成通过一次 Store 提交和一次 `create_debug_samples` 操作落盘，不调用逐节点 UI 创建动作，不改变现有用户数据。

### 实现

- 新增 `src/domain/debugSamples.ts` 纯业务生成器：固定生成总览、48 个连续选择节点、层级/折叠分支、Markdown 语法样例和 UTF-8 100KB 长 Markdown 节点。
- `NotebookStore` 新增 `generateDebugSamples` 动作；`SettingsPanel` 新增“调试样例”区，显示样例数量，生成后按钮禁用并反馈生成数量。
- 新增领域和设置页交互测试，覆盖确定性结构、100KB 文本、幂等性、普通用户笔记共存和按钮状态。
- `docs/PROJECT_INDEX.md` 已索引新模块；README 暂不更新，等待用户验收本轮功能后再同步面向使用者说明。

### 定向验证

- `src/domain/debugSamples.test.ts` 与 `src/features/settings/SettingsPanel.test.tsx` 共 5 条测试通过。
- `npm run check:perf-types`、`npm run check:boundaries` 和 `npm run build` 通过；构建仍只有既有 editor chunk 超过 500kB 提示。
- 用户验收确认调试样例功能无问题；按项目约定，`README.md` 已同步设置页入口和样例覆盖范围。

## 2026-09-01：Windows NSIS 正式安装包

### 用户确认与发布决策

- 用户确认主要使用 Windows `.exe` 安装包，不通过 Microsoft Store 安装。
- 产品正式名称确定为“爱思记”；继续沿用现有黄色笑脸 Logo。
- 本轮只收敛 Windows NSIS 安装包，不引入自动更新、代码签名或商店发布，避免扩大架构和发布流程范围。

### 实现

- `src-tauri/tauri.conf.json` 将产品名和窗口标题统一为“爱思记”。
- Tauri bundle targets 从 `all` 收敛为 `nsis`，正式发布入口为 `*-setup.exe`。
- NSIS 安装器和卸载器复用 `src-tauri/icons/icon.ico`，安装模式默认为当前用户，开始菜单文件夹为“爱思记”。
- `docs/PROJECT_INDEX.md` 增加 Windows NSIS 发布配置和产物索引。
- `README.md` 暂不更新，等待用户实际安装并确认本轮发布包有效后再同步面向使用者说明。

### 验证

- 首次 `npm run check` 已通过模块边界、性能 TypeScript、41 个测试文件/323 条测试和前端生产构建；Rust 配置校验指出 `nsis` 位于错误层级。根因是将其写在 `bundle` 下，正确路径为 `bundle.windows.nsis`；已原地修正，不升级 Tauri 依赖。
- 修正后的完整 `npm run check` 通过：模块边界、性能 TypeScript、41 个测试文件/323 条测试、生产构建、Rust 格式和 Rust 编译均正常；Vite 仅保留既有 editor chunk 超过 500kB 提示。
- `npm run tauri build` 成功，只生成一个 NSIS x64 安装程序：`src-tauri/target/release/bundle/nsis/爱思记_0.1.0_x64-setup.exe`（4,426,829 bytes，SHA-256：`BBD62DE0E342B037303BE60864E61CEE3E69BF753EE8C9F8156304BB3C24A887`）。
- 安装包 Authenticode 状态为 `NotSigned`，符合本轮未引入代码签名的范围；对外发布前需要单独确认并实施证书签名流程。
- 尚未在本机自动执行安装器，避免影响当前开发环境；待用户手动安装验收名称、黄色笑脸图标、开始菜单入口和卸载入口后，再按约定更新 README。

## 2026-09-01：GitHub Windows 安装包自动发布

### 发布决策

- 用户确认使用 GitHub 对外发布，不使用 Microsoft Store。
- 仓库当前未配置 GitHub remote，因此本轮只提交可复用的发布自动化和发布规范；创建公开 GitHub 仓库、配置 remote 与首次推送需要由拥有 GitHub 账号权限的用户完成。

### 实现

- 新增 `.github/workflows/release-windows.yml`：推送 `v*` 标签时在 GitHub Windows runner 上安装 Node 22、Rust stable 和锁定依赖，构建 NSIS 包并创建公开 GitHub Release。
- 工作流在发布前强制校验 Git 标签、`src-tauri/tauri.conf.json` 和 `package.json` 的版本一致；不一致会失败，避免发布页和安装包版本错配。
- 新增 `docs/GITHUB_RELEASE.md`，记录一次性仓库准备、版本发布、发布后验收和未签名安装包的安全提示。
- `docs/PROJECT_INDEX.md` 已索引发布规范和自动化入口；README 按约定继续等待用户确认安装包验收结果后再更新。

### 验证

- 本地检查工作流 YAML 结构和版本校验逻辑；完整云端构建需在 GitHub remote 配置完成、首次推送版本标签后由 GitHub Actions 执行。

## 2026-09-01：GitHub 仓库接入

### 状态

- 已核实 `https://github.com/voidaz19/aisiji.git` 为 `voidaz19/aisiji` 的公开空仓库，并配置为本地 `origin`。
- 当前工作区现有改动已提交到本地 `master`，提交号为 `b547410`（发布流程提交）。
- 首次执行 `git push -u origin master` 时，本机到 GitHub 的 HTTPS 连接在 443 端口失败；代码目前仍未上传，未发生远端部分更新。
- 用户需在可访问 GitHub 的终端重新执行推送，随后推送 `v0.1.0` 标签触发 Windows NSIS 自动发布。
