# App 性能架构审查（2026-08-02）

状态：路线已确认；第 1 步性能观测与第 2 步 Live Preview 增量边界已完成，第 3 步选择计算局部优化和第 4 步拖拽虚拟化首轮已完成，Store 订阅协议、第 4 步精确测量及第 5～6 步待施工。

本文审视当前实现、性能基线和增量持久化提案是否仍是正确路线。结论不是继续在现有路径上追加零散 memo 或放宽预算，而是保留基础技术选型，重做输入事务边界、视图失效边界、Markdown Live Preview 增量计算和大树拖拽虚拟化。

## 1. 本轮证据

环境：Windows 10.0.26200、AMD Ryzen 5 5600、Node v24.14.0、Chromium 生产构建，`PERF_BUDGET_SCALE=1`。

| 场景 | 本轮结果 | 判断 |
| --- | ---: | --- |
| 10k 可见树纯逻辑 P95 | 18.80ms | 虽低于当前 50ms 预算，但已超过 16.7ms 单帧时间 |
| 单节点 100KB Markdown 输入 P95 | 362.30ms | 超过 200ms 预算，且没有 10k 节点压力 |
| 10k 节点 + 100KB Markdown 输入 P95 | 144.60ms | 100 次输入中 59 个 Long Task |
| 组合场景全量持久化 P95 | 25.20ms | 约占输入 P95 21.95%，是明确问题但不是全部问题 |
| 组合场景 Long Task 累计 | 3504ms | 主线程阻塞已经成为连续输入的常态 |
| 40 节点拖拽 | 404.90ms，慢帧比 0 | 小夹具通过，不能证明大树拖拽可用 |
| 节点切换 | 独立场景通过 | 当前未发现无界堆增长，保留现状并继续回归 |

生产构建的 `editor` chunk 为 525.84kB（gzip 182.28kB），Vite 已给出大 chunk 警告。该体积不是当前输入延迟主因，但应用在首页停留 100ms 后仍会预载并挂载隐藏的 NotebookPanel，因此会把编辑器解析、初始化和隐藏视图副作用带入首页时段。

## 2. 根因：一次字符输入被扩散成全局事务

当前一个字符的主要同步路径是：

```text
CodeMirror transaction
  -> 整篇文档 toString
  -> updateMarkdown：cloneState（复制全部实体字典）
  -> commit：contentNodesChanged（扫描全部节点 revision）
  -> saveWorkspace：完整 normalize + JSON.stringify + localStorage.setItem
  -> Zustand 替换整个 nodes 引用
  -> AppShell / NotebookPanel / 选择 Hook 等全局订阅失效
  -> 重建可见树、布局行、完整布局签名和行 props
  -> Markdown Live Preview 遍历完整语法树并重建全部 Decorations
```

这不是单个慢函数，而是局部编辑没有局部边界。仅把 `localStorage` 换成 SQLite/IndexedDB，只能消除当前已测约 22% 的同步持久化成本，无法消除 Store 全量克隆、全节点扫描、全树重算和全文装饰重建。

## 3. 必须推翻重做的部分

### 3.1 Store 提交与视图失效协议

现有 `commit(nextState, operation)` 接收完整状态，并通过扫描前后 `nodes` 判断内容是否变化。所有 Markdown 输入都会替换 `nodes` 容器，使订阅整个 `nodes` 的 AppShell、NotebookPanel 和选择 Hook 一起失效。

目标必须改成“命令结果携带精确变化 + 分离结构版本和内容版本”：

- Markdown 输入只更新目标节点、目标页面最近编辑时间和该节点的订阅者。
- 可见树只在父子关系、删除状态、排序、折叠或查询变化时重算；Markdown 普通字符不得重建 10k 行拓扑。
- AppShell 不订阅完整 `nodes`；根节点、面包屑、今日节点使用窄选择器或独立索引。
- 行组件按 `nodeId` 订阅自身记录，父组件传稳定的拓扑行数据，不把每次新建的完整 NodeRecord 当作所有行的失效信号。
- 父子索引成为状态模型的一等派生结构，由精确变更维护；不能每次查询重新扫描、分组、排序全部节点。

是否继续使用 Zustand 不构成问题；问题是 Store 契约和订阅粒度。无需为此引入 Redux、MobX 或新的全局状态框架。

### 3.2 Markdown Live Preview 更新算法

`markdownDecorations.ts` 在文档、选区、视口或焦点变化时遍历完整语法树；为了寻找当前 reveal 边界先遍历一次，随后构造装饰又遍历一次。100KB 单节点输入 P95 362.30ms 已证明该路线不能靠持久化改造解决。

保留 CodeMirror 6 和现有 Markdown 语法扩展，重写 Live Preview 插件：

- reveal 边界从光标位置向上解析语法祖先，不扫描整棵树。
- 文档变更先映射旧 DecorationSet，只重建变更范围及必要的语法上下文。
- 图片、附件和链接组件只为可视范围及小幅 overscan 生成；离屏文本保留语法高亮，不创建重型 Widget DOM。
- selection-only 更新只处理旧边界与新边界，不重建全文装饰。
- 为 10KB、100KB、1MB 文档分别建立输入、选区移动、滚动和内存预算。

不建议推翻 CodeMirror 自研编辑器；应推翻的是当前“任何变化都全文重建 Live Preview”的插件策略。

2026-08-27 实施结果：保留 Lezer 的增量语法树，把自定义装饰遍历限制到 CodeMirror 当前可见行及一行上下文；revealed boundary 只遍历选区接触的语法分支。当前视口重建已经把 100KB/1MB 装饰构建 P95 压到 0.60ms/0.30ms，因此没有继续引入旧 DecorationSet 变更映射和选区边界缓存；后续只有分项预算重新失败时才增加这层复杂度。1MB 整体输入仍有 Store、React 和持久化 Long Task，不把它误记为 Live Preview 未完成。

2026-08-27 第二轮实施结果：`useNodeRangeSelection` 缓存 10k 行的顺序和深度签名，并在指针移动时复用空的附加选区数组，减少长文多选的父组件无效重算。`NotebookPanel` 拖拽期间保持 TanStack Virtual 开启，对未挂载行使用虚拟器 `measurementsCache` 提供逻辑矩形；1k/10k 拖拽 DOM 行均为 37，专项拖拽完成约 430ms。该实现仍使用估算高度补齐未挂载长行，精确测量和 Store 订阅边界留给后续联合施工。

2026-08-27 用户复测澄清：问题不是单节点 Markdown 很长，而是同一页面存在较多节点时，节点范围选择与节点拖拽变卡。后续基线改用 160 个短文本节点隔离变量。窗口化门槛从 200 下调到 80，补齐中等规模页面；拖选预览期间跳过只有选区菜单才需要的全树缩进/提升命令预演。160 节点选择与拖拽均保持 37 个 DOM 行，选择未产生 Long Task。此前“长行高度放大选择成本”的归因作废，不再以长 Markdown 夹具验证节点选择。

2026-08-27 第三轮实施结果：10k 拖拽启动的剩余阻塞来自领域槽位生成而非 DOM。槽位数组查重和移动节点同级位置判断从逐槽位扫描改为一次性 `Set`/位置索引；`measuredTreeBlocks` 改为单调栈确定所有子树终点。10k 槽位与 10k 深层子树矩形 P95 分别为 13.13ms/0.35ms，Chromium 10k 拖拽启动从约 4.18s 降至单场景 227ms、完整专项矩阵 608ms。第 4 步的大树拖拽启动与 DOM 窗口化红线至此关闭，后续仍需保留滚动后未测量长行的估算高度边界。

### 3.3 大树拖拽与虚拟化契约

`NotebookPanel` 以 `dragId === null` 作为虚拟化条件，开始拖拽后会关闭虚拟化并对全部 `renderedRows` 渲染。现有拖拽性能测试只生成 40 个节点，因此没有覆盖 10k 大纲会挂载全部行的确定性退化。

拖拽必须在虚拟化保持开启时工作：

- DragOverlay 只渲染被拖子树的轻量预览。
- 占位高度由逻辑行模型或虚拟器测量缓存提供，不通过挂载全部源行获得。
- 命中测试只计算视窗邻近槽位，并在滚动时按逻辑索引扩展，不为全部行读取 DOM。
- 新增 1k/10k 拖拽测试，并断言拖拽期间 DOM 行数仍受上限约束。

### 3.4 隐藏 NotebookPanel 的生命周期

首页 100ms 后会加载 NotebookPanel 和 SettingsPanel，随后 NotebookPanel 即使不可见也保持挂载。隐藏视图仍可能保留 CodeMirror、Observer 和 document/window 监听器。

应把导航状态与重型视图生命周期分开：NotebookPanel 不可见时卸载重型编辑器和布局系统，或采用明确的 suspend/resume 协议；设置页无需首页预载。预加载应由 `requestIdleCallback`、用户意图或首个导航触发，并纳入启动后 5 秒主线程预算。

## 4. 应简化而非扩建的部分

- `NotebookPanel.tsx` 同时负责虚拟化、拖拽、选择、FLIP、层级线、布局调试和画布落点。拆分依据应是运行时责任和失效边界，而不是仅把 JSX 移到更多文件。
- 每个近视口 InlineEditor 都注册 document/window 监听、MutationObserver 和原生文件拖放监听。应提升为 Notebook 级单实例协调器，再把命中目标分派给活动编辑器。
- `layoutSignature` 对全部行拼接长字符串以驱动多个布局 Effect。改用显式 `topologyRevision`、虚拟窗口版本和局部测量事件。
- `treeLayoutRows` 为判断子节点再次扫描全部 `state.nodes`；应消费维护好的 child index/child count。
- Dashboard、Settings 和 AppShell 中的 `Object.values(nodes)` 聚合应改为增量计数或低频派生快照，避免任何字符输入触发全库统计。
- 编辑器大 chunk 可在输入路径稳定后再拆分；先消除隐藏挂载和无条件预载，比调整 Rollup chunk 名称更有价值。

## 5. 对现有增量持久化 SPEC 的裁决

`PERSISTENCE_SPEC.md` 对 SQLite/IndexedDB 实体化、事务、操作合并、WAL 和连接复用的方向成立，应保留；但它目前不足以单独作为性能架构施工依据。

实施前必须补充以下约束：

1. `NotebookChangeSet` 同时驱动内存局部更新、派生索引更新和持久化，禁止先构造完整新状态再让 Store 全局替换。
2. 明确 `topologyRevision`、节点内容 revision 和本地视图 revision 的独立失效语义。
3. 输入性能完成标准分开衡量编辑器内部、Store、React commit 和持久化，不再只代理 `JSON.stringify`/`localStorage`。
4. Tauri 原生基线必须覆盖 WebView2、IPC、SQLite 事务和强制 flush；浏览器两帧 settle 不能代表 180ms 后的原生耐久完成。
5. 在上述契约冻结前，不应直接开始 SQLite v2 大规模施工，否则可能得到“磁盘增量、内存仍全量”的半成品。

## 6. 性能测试体系需要重做的门槛

现有测试应保留夹具和机器可读结果格式，但调整以下问题：

- 浏览器测试使用 serial 模式，前一个失败会跳过后续场景；各场景应可独立执行并在最后汇总全部失败。
- 10k 可见树预算 50ms 高于单帧预算；拆成冷构建预算与输入期间禁止发生的拓扑重建断言。
- 200ms 输入预算不足以代表顺滑编辑；目标应至少记录按键到 CodeMirror commit、React commit 和下一帧三个时间点，连续输入 P95 以不制造 Long Task 为硬门槛。
- 拖拽夹具从 40 扩展到 1k/10k，并检查拖拽前、中、后的 DOM 数量。
- 增加“编辑叶节点不调用 visibleNodes/treeLayoutRows”“只重渲染目标行”的结构性断言，避免硬件变快掩盖全局失效。
- 增加 1MB Markdown、长文滚动、选区移动、Live Preview Widget 密集文档。
- 接入 Tauri 原生测试层；在此之前不得宣称桌面持久化性能达标。

## 7. 保留项与施工顺序建议

保留 React 19、Zustand、CodeMirror 6、TanStack Virtual、领域纯函数边界、SQLite/IndexedDB 目标和现有确定性夹具。节点切换、40 节点拖拽及当前小规模交互未显示需要更换框架。

建议按风险隔离顺序施工：

1. 先修性能测试编排和观测，加入渲染次数、调用次数、大树拖拽和 Live Preview 分项基线。
2. 重写 Markdown Live Preview 增量算法，单独把 100KB/1MB 输入路径压到无 Long Task。
3. 重做 Store/派生索引/订阅失效协议，保证字符输入不重算树拓扑。
4. 重做拖拽虚拟化契约和 NotebookPanel 运行时边界。
5. 在新的 ChangeSet 契约上实施 SQLite/IndexedDB 增量持久化，而不是先落地旧 SPEC 的完整状态返回形式。
6. 最后处理 chunk、预加载和次要聚合，完成 Tauri 原生验证。

第 2～5 步均属于重大或架构级施工，开始前必须由用户确认范围和顺序。
