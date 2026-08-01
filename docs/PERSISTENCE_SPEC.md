# 增量持久化 SPEC

状态：架构提案；开发期旧数据直接忽略并重建已确认，待确认耐久窗口和操作语义后实施。

本文定义用“实体增量持久化 + 操作日志”替换“单行 JSON 快照”的目标结构。实现不得改变既有节点身份、编辑、拖拽、删除恢复、附件引用和同步协议语义。

## 1. 背景与目标

当前每次 durable Store 提交都会：

1. 规范化完整 `NotebookState`。
2. `JSON.stringify` 全部节点、字段、附件和本地元数据。
3. 同步覆盖浏览器 `localStorage`。
4. Tauri 环境在 180ms 批次中覆盖 SQLite 的单行 `workspace_state.state_json`，并追加操作日志。

10k 节点与 UTF-8 100KB Markdown 的组合测试中，约 2.38MB 工作区每 100 次输入发生 100 次全量序列化和 100 次同步写入；持久化 P95 为 25.1～28.4ms，Long Task 数为 48～78/100。

目标：

- Markdown 修改只提交被修改节点，不遍历或序列化其他节点。
- 树操作只提交命令实际改动的节点和关联实体。
- 当前状态与操作日志在同一事务中原子提交。
- Tauri 使用 SQLite/WAL；浏览器预览使用 IndexedDB；两端实现同一 Repository 契约。
- 现有开发期 JSON 工作区不迁移；实施切换时清空并由新 schema 创建空工作区。
- 为未来同步保留稳定、可压缩、可重放的操作日志。

非目标：

- 本轮不实现 WebDAV 同步、CRDT、OT 或移动端适配。
- 不同步 SQLite 文件。
- 不通过延后一次完整 JSON 保存来伪装成增量持久化。
- 不兼容或迁移当前开发期 SQLite、localStorage、IndexedDB 工作区数据，也不支持旧版本应用读取新数据。
- 不在客户端嵌入或要求用户安装 PostgreSQL；若未来建设自有同步服务，PostgreSQL 只能位于服务端并通过 API 接入。

## 2. 目标数据流

```text
用户意图
  -> domain command：返回新状态 + 精确 NotebookChangeSet
  -> store：附加页面上下文、耐久级别和待持久化操作
  -> PersistenceCoordinator：按实体键合并队列
  -> WorkspaceRepository.commit(batch)
       Tauri -> SQLite 单事务 + WAL
       Browser -> IndexedDB 单事务
```

Store 继续立即更新内存状态，界面不等待磁盘。Repository 严禁接收完整 `NotebookState` 作为普通编辑的保存参数。

## 3. 领域变更集

领域命令必须显式报告实际变化，禁止 Repository 通过扫描前后两个完整工作区来猜测差异。

建议契约：

```ts
interface NotebookChangeSet {
  upsertNodes: NodeRecord[];
  removeNodeIds: string[];
  upsertFields: NodeField[];
  removeFieldIds: string[];
  upsertAttachments: AttachmentRecord[];
  removeAttachmentIds: string[];
  collapsed: Array<{ nodeId: string; value: boolean | null }>;
  recentPageEdits: Array<{ pageId: string; editedAt: number | null }>;
}

interface NotebookCommandResult {
  state: NotebookState;
  changes: NotebookChangeSet;
}
```

- `value: null` 表示删除显式折叠状态或最近页面记录。
- 软删除是节点 upsert；只有清空回收站才进入 `removeNodeIds`。
- 批量移动必须包含被重新编号的兄弟节点，不能只返回拖动根节点。
- 附件文件仍由平台附件模块管理；`NotebookChangeSet` 只处理附件元数据。
- `domain` 只描述发生了哪些业务变化，不导入 Repository、IndexedDB、SQLite 或 Tauri 类型。

导入导出可以使用独立的全量边界；日常命令不得借用该入口保存工作区。

## 4. Store 与持久化协调器

Store 将领域变更集转换为：

```ts
interface DurableMutation {
  changes: NotebookChangeSet;
  operation?: PendingOperation;
  durability: "deferred-content" | "immediate";
}
```

规则：

- `update_markdown` 使用 `deferred-content`。
- 创建、拆分、合并、移动、缩进、删除、恢复、字段、附件和永久清理使用 `immediate`。
- 展开/折叠与最近页面记录属于本地耐久数据，可以与最近批次合并，但不要求生成同步操作。
- immediate 操作必须先吸收队列中更早的 Markdown 变更，再按用户发生顺序提交一个事务。
- 队列写入期间若又产生变化，合并到下一批；失败批次原样保留并退避重试。
- `flush()` 必须等待当前批次和失败重试完成；清空回收站、附件物理删除、页面隐藏和应用退出均调用它。

### 4.1 Markdown 合并

同一节点在一个未落盘窗口内只保留最终 `NodeRecord` 和一个 `update_markdown` 操作：

- `baseRevision` 取窗口开始前的 revision。
- `resultRevision` 取最终节点 revision；实现时扩展 Operation 契约。
- `payload.markdown` 保存最终 Markdown，不保存每个按键的完整文档副本。
- `opId`、设备 sequence 和 HLC 在批次定稿时生成，而不是每个按键生成。
- 不同节点分别合并，不跨结构操作重排。

推荐调度参数：内容变更尾随等待 200ms，连续输入最长 1000ms 必须提交一次。该参数只减少耐久操作数量，不改变内存中的即时编辑。

## 5. SQLite v2 模型

数据库连接由 Tauri 启动时创建并作为受控状态复用，不再为每个命令重新打开文件。每次连接启用：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

目标表：

```text
nodes
  id PK, kind, parent_id, sort_key, markdown, date_key,
  deleted_at, revision, created_at, updated_at

node_fields
  id PK, node_id FK, key, type, value, updated_at

attachments
  id PK, node_id FK, name, mime, size, sha256,
  local_path, remote_path, pinned, created_at

node_view_state
  node_id PK/FK, collapsed

recent_page_edits
  page_id PK/FK, edited_at

operations
  op_id PK, device_id, sequence, hlc, base_revision,
  result_revision, kind, entity_id, payload_json, created_at

workspace_meta
  key PK, value
```

必要索引：

- `nodes(parent_id, sort_key, created_at)`：子节点排序。
- `nodes(deleted_at)`：活动节点与回收站。
- `node_fields(node_id)`、`attachments(node_id)`。
- `operations(device_id, sequence, op_id)`、`operations(kind, entity_id)`。

父子外键使用事务内延迟检查，允许一次树移动事务中先后更新多个节点。硬删除节点级联删除字段、视图状态和最近记录；附件元数据删除与文件删除采用下述两阶段规则。

## 6. 原子事务边界

一次 `WorkspaceRepository.commit(batch)` 对应一个数据库事务：

1. upsert/delete 节点。
2. upsert/delete 字段、附件元数据和本地元数据。
3. 插入已经定稿的操作日志，`op_id` 幂等。
4. 更新 `workspace_meta.last_commit_at`。
5. commit。

任一步失败则整个事务回滚。Store 内存状态不回退，但持久化队列保留该批次并报告错误。

附件文件系统无法与 SQLite 组成同一事务：

- 导入：先把文件写入临时文件并原子改名，再提交附件元数据；数据库失败时清理新文件。
- 永久删除：先提交元数据删除和待删除文件记录，再删除文件；文件删除失败由维护任务重试。
- 普通软删除不删除附件文件。

## 7. Repository 契约与适配器

```ts
interface WorkspaceRepository {
  load(): Promise<NotebookState | null>;
  initialize(state: NotebookState): Promise<void>;
  commit(batch: DurableBatch): Promise<void>;
  flush(): Promise<void>;
  maintain(): Promise<DatabaseMaintenanceReport | null>;
}
```

### 7.1 Tauri/SQLite

- 前端只向 Tauri 发送本批次变化实体和操作，不发送完整工作区 JSON。
- Rust 在一个 `apply_workspace_mutation` 命令中完成事务。
- `load` 可以在启动时一次性返回完整工作区；全量读取是允许的，全量按键写入是不允许的。
- 现有 `save_workspace`、`save_workspace_batch` 和单行快照入口在架构切换时直接删除。

### 7.2 Browser/IndexedDB

对象仓库与 SQLite 表一一对应：`nodes`、`fields`、`attachments`、`nodeViewState`、`recentPageEdits`、`operations`、`meta`。

- 每个 DurableBatch 在一个跨对象仓库的 IndexedDB transaction 中提交。
- `localStorage` 只保留设备 ID 和无关的小型偏好，不再保存、读取或迁移工作区快照。
- IndexedDB 适配器必须通过与 SQLite 适配器相同的 Repository 合同测试。

## 8. 开发期 Schema 重建与初始化

用户已明确当前没有需要保留的有效数据，因此旧格式不属于输入边界：不识别内容、不读取状态、不建设迁移层，只按明确目标重建新 schema。

### 8.1 Tauri

1. 新实现首次启动时识别数据库 format version。
2. 若不是目标版本，关闭连接并删除开发期 `notebook.sqlite3`、`-wal` 和 `-shm` 文件，再创建 SQLite v2。
3. 同时删除旧工作区 localStorage 键 `aisiji-notebook-state-v1`；设备 ID 等非工作区小型设置不删除。
4. 使用领域 seed 通过 `WorkspaceRepository.initialize` 创建根节点和初始数据。

### 8.2 浏览器

1. 删除旧工作区 localStorage 键。
2. 若 IndexedDB schema 不是目标版本，删除旧工作区数据库并创建目标对象仓库。
3. 使用同一领域 seed 初始化。

### 8.3 边界

- 不解析、导入、备份或校验旧 `workspace_state.state_json`。
- 不保留旧表供降级使用，不实行新旧格式双写。
- 数据重建只针对明确的工作区数据库和工作区存储键，不删除附件目录、设备 ID、凭据或其他应用设置；附件目录孤儿由维护任务单独清理。
- 正式发布并产生真实用户数据后的升级策略不属于本 SPEC；届时必须另行设计，不能默认沿用开发期清空策略。

## 9. 操作日志与未来同步

- 当前状态表是本地读取的物化状态；operations 是同步、审计和冲突处理依据，两者在同一事务中更新。
- `update_markdown` 只合并尚未持久化、尚未发布的同节点操作；已经写入数据库或进入同步块的操作不可改写。
- 结构操作不跨事务合并。
- merge、初始化产生的真实内容变化等当前缺少显式操作的路径必须在实施阶段补齐或明确标记为仅本地系统操作。
- 操作压缩只删除已被稳定快照/同步游标覆盖的冗余操作；不能只因“不是最新 Markdown”就删除尚未确认发布的历史。
- WebDAV 格式继续使用 `docs/SYNC_PROTOCOL.md`；本 SPEC 不改变远端文件结构。

## 10. 实施顺序

1. 为领域命令增加精确 `NotebookChangeSet`，用纯测试锁定每种命令的变化实体。
2. 建立 Repository 接口、队列合并器和跨适配器合同测试。
3. 实现 SQLite v2 schema、WAL、复用连接、事务命令和开发期 schema 重建测试。
4. 实现 IndexedDB 适配器及浏览器 schema 重建测试。
5. 补齐操作日志语义和 Markdown 未落盘操作合并。
6. 在一次切换中替换 Store 的快照保存与双源 hydration，不进行生产双写。
7. 运行 schema 重建、完整功能检查、Tauri 实测和自动化性能回归。
8. 用户确认数据重建和性能后再更新 README。

## 11. 测试与完成标准

必须覆盖：

- 每个领域命令返回的 upsert/remove 实体精确且不遗漏兄弟排序变化。
- SQLite 一个事务内同时更新实体和操作；注入失败后不留下半批数据。
- IndexedDB 与 SQLite 对同一批输入得到等价 `NotebookState`。
- 非目标 schema 会被限定范围地重建，SQLite WAL/SHM 与旧工作区键不会残留并参与新状态竞争。
- 重复初始化不生成重复根节点或 seed 数据。
- Markdown 队列按节点合并，结构操作强制刷新，失败批次不丢失。
- 应用隐藏、退出、清空回收站和附件删除前 `flush()` 完成。
- 现有 `npm run check` 全部通过。
- 组合性能场景不再发生完整 workspace localStorage 写入，100 次连续输入的 Long Task 数不超过 30，其他既定预算保持通过。

## 12. 待确认决策

实施前需要冻结以下决策：

1. **内容耐久窗口**：200ms 尾随提交、连续输入最长 1000ms 强制提交；进程在窗口内被强制终止可能丢失最后一小段尚未入库内容。推荐接受，这是经典自动保存取舍。
2. **Markdown 操作合并**：未入库的同节点输入合并为一个含最终 Markdown 的操作，并新增 `resultRevision`。推荐接受。
3. **本地元数据不进入同步操作**：折叠状态只本地持久化；最近页面上下文继续由内容操作的 `pageId` 支撑。推荐接受。

已确认的数据库边界：桌面本地状态使用 SQLite，浏览器预览使用 IndexedDB；PostgreSQL 不替代客户端数据库，仅作为未来自建同步服务的候选服务端存储。

已确认的数据边界：当前没有需要保留的有效数据；实施时直接重建工作区数据库和工作区存储键，不读取旧内容，不建设兼容、迁移、双写或降级层。
