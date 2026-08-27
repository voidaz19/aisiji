# 节点笔记

面向 Windows 和 Android 的本地优先节点笔记应用。前端使用 React 19、TypeScript、Vite，桌面与移动壳使用 Tauri 2。

## 当前能力

- 全局树形大纲、日期节点和今天入口
- 页面导航历史：顶部前进/后退按钮与 `Alt+左/右方向键` 可在主页、设置、笔记视图和具体笔记位置之间切换
- 节点进入、折叠、回车拆分、键盘缩进/提升和整棵子树拖拽；空节点回车在下方连续创建，提升不会越过当前页面根
- 虚节点复用真实节点命令语义：`Tab`/`Shift+Tab` 只有在缩进或提升可生效时才实体化，并沿用普通节点的层级位移动画
- 连续可编辑画布与节点选择：节点内拖选文字，越过节点布局后预览连续节点范围，也可用 `Ctrl/Cmd+点击` 选择不连续节点；节点选区支持删除、`Tab` 批量缩进和 `Shift+Tab` 批量提升，结构操作后保留选区
- 文本与节点选区浮动菜单：完成选择后在对象上方显示；文本支持常用格式、复制和剪切，节点支持复制、剪切、删除以及当前可执行的提升/缩进操作，复制后提供明确反馈
- 统一的桌面与浏览器控件视觉：画布、按钮、输入框、文本选区和滚动条使用应用样式，同时保留键盘焦点反馈
- 语法树驱动的 Markdown Live Preview：H1-H6、引用、待办、粗体、斜体、删除线、高亮、行内代码和分隔线
- 统一的插入与格式菜单：通过节点旁的 `+` 菜单搜索并执行格式、结构、节点链接和文件操作；Markdown 快捷输入仍可直接使用
- 普通链接、节点链接、图片与已登记附件预览；Markdown 控制符按需显形、当前节点源码模式和常用格式快捷键
- 单一“插入文件”入口支持桌面原生多选和资源管理器拖放；文件按 MIME 类型自动进入图片、音频、视频、PDF、文本或普通文件预览，并在异步处理期间保持插入位置和后续节点层级动画稳定
- 字段模型（文本、数字、日期、布尔值和节点链接）
- 回收站、操作日志、本地 SQLite 命令和系统密钥环命令
- 坚果云 WebDAV 探测、列表、上传、下载和不可变操作块协议
- 图片及常见文件附件，单文件 20MB；桌面端从本机路径分块复制到应用附件目录并计算 SHA-256，导入后不依赖原文件；附件插入失败支持保留原选区并重试失败项

## 开发

```powershell
npm install
npm run dev -- --host localhost --port 4173
```

浏览器预览地址：`http://localhost:4173/`

项目按功能模块和平台适配器分层。新增功能或调整目录前，请先阅读 [项目架构](docs/ARCHITECTURE.md)；Markdown 支持边界见 [Markdown 编辑规范](docs/MARKDOWN_SPEC.md)。

运行 Windows Tauri 开发版：

```powershell
npm run tauri dev
```

如果 Cargo 默认访问 crates.io 很慢，可使用可达的镜像配置执行：

```powershell
cargo check --config 'source.crates-io.replace-with="rsproxy"' --config 'source.rsproxy.registry="sparse+https://rsproxy.cn/index/"'
```

## 测试与构建

```powershell
npm run check
```

`npm run check` 会依次检查模块依赖边界、前端测试、TypeScript/生产构建、Rust 格式和 Rust 编译。也可以单独运行：

```powershell
npm run check:boundaries
npm test
npm run build
cargo check --config 'source.crates-io.replace-with="rsproxy"' --config 'source.rsproxy.registry="sparse+https://rsproxy.cn/index/"'
```

性能回归使用固定的 1k/10k 工作区与 100KB Markdown 夹具，覆盖输入分段、Long Task、虚拟化 DOM、节点切换和拖拽：

```powershell
npm run test:perf
```

当前性能红线与重大重做边界见 [性能测试规范](docs/PERFORMANCE.md) 和 [2026-08-02 性能架构审查](docs/PERFORMANCE_AUDIT_2026-08-02.md)。性能测试失败表示已记录的问题仍存在，不应通过放宽预算隐藏。

Windows release 二进制输出在 `src-tauri/target/release/tauri-app.exe`。

## Android 环境

本机已经检测到 Android SDK，但缺少 Android Command-line Tools，因此 `npm run tauri android init` 尚未完成。请在 Android Studio 的 SDK Manager 安装：

- Android SDK Command-line Tools (latest)
- Android SDK Platform Tools
- Android SDK Platform（当前目标 API）
- Android SDK Build Tools
- NDK (Side by side)

然后重新打开终端执行：

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm run tauri android init
npm run tauri android dev
```

Android 发行包：

```powershell
npm run tauri android build
```

坚果云凭据只应填写在应用设置中，使用 WebDAV 应用密码；不要提交到源码或 `.env` 文件。
