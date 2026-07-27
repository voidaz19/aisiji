# 项目架构

项目采用“功能模块 + 单向依赖”的渐进式模块化结构。新增功能应优先放入对应模块，避免继续扩大入口文件或直接在界面中调用 Tauri 命令。

节点身份、树操作、删除与恢复等已确认语义见 [节点领域规则](DOMAIN_RULES.md)。架构调整不得在未确认的情况下改变这些行为。

## 前端目录

```text
src/
  app/          应用装配、顶级导航和壳组件
  features/     按用户功能组织的页面、组件、Hook 和选择器
  components/   多个功能共用的编辑器与树行组件
  domain/       与 React、浏览器和 Tauri 无关的纯业务模型与树规则
  store/        Zustand 状态编排、操作日志和 UI 状态
  sync/         同步协议及传输接口
  platform/     Tauri/浏览器能力适配器
  shared/       无业务归属的轻量通用工具
```

允许的主要依赖方向：

```text
app -> features -> store -> domain
               -> platform
sync -> domain
platform -> domain（仅类型）
```

- `domain` 不得导入 React、Zustand、DOM 或 Tauri API。
- `features` 不应直接调用 `invoke`；平台调用集中在 `platform` 适配器中。
- `App.tsx` 只作为稳定入口，应用装配位于 `app/AppShell.tsx`。
- 可测试的筛选、路径和排序规则应写成纯函数，并在同目录添加测试。
- 节点拆分、合并、移动和删除等完整用户意图放在 `domain/commands/`，由 Store 负责解释交互状态并提交结果。
- 拖拽的语义插槽放在 `domain/dropSlots.ts`；DOM 测量和插入线布局留在笔记功能模块，横向坐标不得进入领域规则。
- 模块之间优先通过明确的 props、类型和接口连接，避免新增隐式全局状态。

## Rust 目录

```text
src-tauri/src/
  lib.rs          Tauri 启动与命令注册
  database.rs     SQLite 工作区和操作日志
  attachments.rs  附件文件与哈希
  credentials.rs  系统密钥环
  webdav.rs       WebDAV 网络传输
```

新增 Tauri 命令时，把实现放入所属模块，仅在 `lib.rs` 注册。跨模块复用的业务规则应提取为不带 `#[tauri::command]` 的普通函数。

## 新功能落位示例

- 新增标签功能：`features/tags/`，纯标签规则放 `domain/`，持久化命令放 `database.rs`。
- 新增同步策略：协议合并规则放 `sync/`，Tauri 网络调用放 `platform/` 或 Rust `webdav.rs`。
- 新增页面：页面组件放 `features/<name>/`，只在 `app/AppShell.tsx` 接入导航。

## 验证

提交前至少运行：

```powershell
npm run check
```

模块依赖检查也可以通过 `npm run check:boundaries` 单独执行。
