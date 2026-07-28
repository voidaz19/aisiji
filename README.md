# 节点笔记

面向 Windows 和 Android 的本地优先节点笔记应用。前端使用 React 19、TypeScript、Vite，桌面与移动壳使用 Tauri 2。

## 当前能力

- 全局树形大纲、日期节点和今天入口
- 节点进入、折叠、键盘缩进/提升、整棵子树拖拽
- 语法树驱动的 Markdown Live Preview：H1-H6、引用、待办、粗体、斜体、删除线、高亮、行内代码和分隔线
- 普通链接、节点链接、图片与已登记附件预览；Markdown 控制符按需显形、当前节点源码模式和常用格式快捷键
- 字段模型（文本、数字、日期、布尔值和节点链接）
- 回收站、操作日志、本地 SQLite 命令和系统密钥环命令
- 坚果云 WebDAV 探测、列表、上传、下载和不可变操作块协议
- 图片及常见文件附件，单文件 20MB，SHA-256 校验和本地缓存

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
