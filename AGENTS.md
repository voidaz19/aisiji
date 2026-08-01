# AI 开发说明

## 沟通原则

- 默认使用中文交流。
- 每次进度或结果报告都要明确说明用户下一步需要做什么；无需用户操作时也要明确说明。
- 修改代码前先确认现有未提交改动，禁止覆盖或回退用户成果。

## 项目目标

本项目是基于 React 19、TypeScript、Vite、Zustand 和 Tauri 2 的本地优先节点笔记应用。开发时优先保证：

1. 编辑行为保持稳定；当前开发期没有有效用户数据，持久化架构切换可直接重建工作区，不建设旧数据兼容层。
2. 模块边界清晰，新增功能容易定位。
3. 纯业务规则可独立测试。
4. 浏览器预览与 Tauri 环境均可工作。

## 目录职责

```text
src/
  app/          应用装配、顶级导航和壳组件
  features/     按用户功能组织的页面、组件、Hook 和选择器
  components/   多个功能共用的编辑器与树行组件
  domain/       与 React、Zustand、DOM、Tauri 无关的纯业务模型和规则
  store/        Zustand 状态编排、动作和操作日志
  sync/         同步协议及传输接口
  platform/     浏览器和 Tauri 能力适配器
  shared/       无业务归属的轻量类型与工具

src-tauri/src/
  lib.rs          Tauri 启动与命令注册
  database.rs     SQLite 工作区和操作日志
  attachments.rs  附件文件与哈希
  credentials.rs  系统密钥环
  webdav.rs       WebDAV 网络传输
```

## 依赖规则

- `app` 可以装配其他前端模块。
- `features` 可以依赖 `components`、`store`、`domain`、`platform`、`sync` 和 `shared`，禁止反向依赖 `app`。
- `components` 禁止依赖 `app` 或具体 `features`。
- `store` 禁止依赖 React 组件、`app` 或 `features`。
- `domain` 禁止依赖 React、Zustand、DOM、Tauri、`store`、`features` 或 `app`。
- `platform` 禁止依赖界面与 Store；平台调用应通过此层或明确的同步传输适配器完成。
- `sync/protocol.ts` 保持纯逻辑；Tauri 传输实现放在独立适配器中。
- Rust 新命令放入所属模块，只在 `lib.rs` 注册。

运行 `npm run check:boundaries` 可自动检查主要依赖边界。

## 开发约定

- 优先创建清晰、独立的小模块，避免新增巨型组件或 Store 文件。
- 可测试的筛选、排序、树操作和路径计算写成纯函数。
- 功能测试与源码就近放置，使用 `*.test.ts` 或 `*.test.tsx`。
- 界面组件不得直接新增 `invoke` 调用；先创建 `platform` 适配器。
- 保持 `src/App.tsx` 和 `src-tauri/src/lib.rs` 为轻量入口。
- 不为单次需求创建无实际边界价值的抽象层。

## 完成标准

修改完成后运行：

```powershell
npm run check
```

该命令会检查模块边界、前端测试、TypeScript/生产构建、Rust 格式和 Rust 编译。若只修改文档，可说明原因并跳过不相关检查。

更多设计说明见 `docs/ARCHITECTURE.md`。
