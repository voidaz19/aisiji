# 性能测试规范

本文定义可重复的性能基线、回归预算和执行方式。性能结论以自动化采样为主要依据；人工体验用于发现新场景，不作为回归是否通过的唯一标准。

## 测试分层

| 层级 | 实现 | 覆盖范围 |
| --- | --- | --- |
| 纯逻辑基准 | `performance/domain.perf.test.ts`、专用 Vitest 配置 | 1k/10k 可见树、10k 搜索、1k 布局行计算 |
| Chromium 交互 | `performance/browser.perf.spec.ts`、Playwright | 生产构建启动、10k 大纲、1k 展开、100KB/1MB Markdown、10k+100KB 组合输入、节点切换、40/1k/10k 拖拽、Live Preview 构建/扫描范围、输入分段、重渲染/拓扑计数、长任务、帧间隔、DOM 数量和 JS 堆增长 |
| Tauri 原生 | 尚未接入 | WebView2、SQLite 和原生附件链路；同步或移动端施工前另行设计，不用浏览器结果冒充原生结果 |

固定工作区由 `performance/fixtures.ts` 确定性生成，不读取开发者的真实工作区，也不依赖手工录入。

## 执行命令

首次在新环境运行：

```powershell
npm install
npx playwright install chromium
```

完整性能回归：

```powershell
npm run test:perf
```

按层执行：

```powershell
npm run test:perf:domain
npm run test:perf:browser
```

`npm run check` 会检查性能测试源码的 TypeScript 类型，但不会启动耗时较长的浏览器性能回归。性能回归应在性能施工前后、合并前或固定硬件的定时 CI 中执行。

## 指标与预算

- 纯逻辑操作先预热 5 次，再采样 20 次，预算判断使用 P95。
- Markdown 输入采样 15 次并使用 P95，避免单次自动化调度噪声决定结果。
- Live Preview 分别记录每次装饰构建耗时和实际扫描字符数。构建 P95 必须低于 34ms；扫描字符数是不可随硬件缩放的结构指标，100KB/1MB 文档都不得因一次输入退化为全文扫描。
- 1MB 场景单独记录整体输入 P95 和 Long Task 数用于后续 Store/持久化归因；本阶段的硬门槛只约束 Live Preview 自身，禁止把其他层的耗时归入预览预算或反向掩盖预览回退。
- 组合压力场景在 10k 节点工作区的 UTF-8 100KB 文档中连续输入 100 次；除总输入 P95 外，分别记录全量工作区 `JSON.stringify`、`localStorage.setItem`、同步持久化合计耗时、调用次数和持久化占总输入时间的 P95 比例。Long Task 以单次 P95 与出现次数作为回归门槛，累计时长只作诊断，避免用易受采样次数影响的总和误判。
- 组合输入同时记录从按键到 CodeMirror 提交、Store 同步提交、React/Notebook 提交的分段 P95，以及 AppShell、NotebookPanel、树拓扑和树行的执行次数。探针没有安装时不保留样本。
- 浏览器交互等待两帧确认 React/CodeMirror 已提交，再记录操作耗时。
- `PerformanceObserver` 汇总主线程长任务；`requestAnimationFrame` 统计超过 34ms 的慢帧比例。
- 大树展开同时限制实际挂载的 DOM 行数，防止性能耗时暂时正常但虚拟化已失效。
- 1k/10k 拖拽在按住指针期间继续检查 DOM 行数上限，禁止通过关闭虚拟化获得拖拽布局。
- 节点切换前后主动回收 Chromium JS 堆，再判断保留内存增长。
- 预算集中定义在 `performance/budgets.ts`，不得在测试用例中散落临时阈值。

不同等级的固定 CI 机器可以通过 `PERF_BUDGET_SCALE` 统一缩放预算，例如：

```powershell
$env:PERF_BUDGET_SCALE = "1.25"
npm run test:perf
```

该变量只用于记录明确的硬件差异。修改默认预算或缩放系数前，应保留前后 JSON 结果并说明原因，禁止用扩大预算掩盖同一环境中的代码回退。
DOM 行数等结构性预算不会随该系数放宽。

## 结果与追溯

每次运行生成：

```text
performance-results/
  domain.json
  browser.json
  playwright-artifacts/   失败时的页面上下文与 trace
```

JSON 包含指标值、预算、通过状态、Node/系统/CPU 和预算缩放系数。该目录属于本机产物，不提交 Git；需要长期比较时由 CI 作为 artifact 保存。

浏览器套件会先运行所有可执行场景并写出完整 JSON，最后统一报告超预算指标。一个已知性能红线不会再自动跳过其后的节点切换或拖拽场景。

新增性能场景时必须同时完成：固定夹具、预热或稳定等待、机器可读指标、预算、失败断言、项目索引和开发日志。若场景受网络、真实文件或系统动画影响，先隔离这些变量，不能用单次墙钟计时作为门槛。

## 当前已知性能红线

截至 2026-08-02，单节点 UTF-8 100KB Markdown 输入 P95 曾达到 362.30ms；“10k 节点 + UTF-8 100KB Markdown + 100 次输入”组合场景记录到 59 个 Long Task，超过最多 30 的预算。完整工作区约 2.38MB，每次输入仍发生一次全量序列化和一次同步 localStorage 写入。

2026-08-27 完成 Live Preview 视口有界改造后，定向与完整套件中的 100KB/1MB 装饰构建 P95 均处于 0.30～0.60ms，扫描字符 P95 分别为 2694/1570，稳定通过 34ms 和 65536 字符预算。1MB 整体输入仍约 577～599ms，并记录到 11～12 个 Long Task；分项探针证明这些阻塞不来自 Live Preview 装饰构建，继续由 Store/订阅失效与全量持久化阶段处理。

源码审查还确认拖拽时会关闭虚拟化；1k/10k 拖拽 DOM 上限测试用于锁定该结构性红线。当前剩余失败继续驱动 `docs/PERFORMANCE_AUDIT_2026-08-02.md` 中的 Store 失效边界、拖拽虚拟化和增量持久化施工，不得通过放宽预算消除。
