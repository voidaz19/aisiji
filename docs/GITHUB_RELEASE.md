# GitHub Windows 发布规范

本项目通过 GitHub Releases 面向公众分发 Windows x64 的 NSIS 安装包。用户从 Release 页面下载 `爱思记_<版本>_x64-setup.exe` 后即可安装，不需要本机开发环境。

## 一次性准备

1. 在 GitHub 创建公开仓库，建议仓库名为 `aisiji`。公开仓库的 Release 资产可直接被所有用户下载。
2. 在本地仓库配置 GitHub 远程地址并首次推送默认分支：

```powershell
git remote add origin https://github.com/<GitHub 用户名>/aisiji.git
git push -u origin <当前分支名>
```

3. 在仓库 Settings -> Actions -> General 中确认 Workflow permissions 为 "Read and write permissions"，以便工作流创建 Release 并上传安装包。

GitHub Actions 首次运行会在云端下载 Node、Rust 和依赖，耗时通常比本地构建长。发布流程不依赖本机生成的 `target` 目录。

## 发布版本

发布前将以下三个版本统一为同一个值，例如 `0.1.1`：

- `package.json` 的 `version`
- `package-lock.json` 顶层 package 的 `version`
- `src-tauri/tauri.conf.json` 的 `version`

提交并推送版本改动后，创建与版本匹配的标签：

```powershell
git tag v0.1.1
git push origin v0.1.1
```

`.github/workflows/release-windows.yml` 会在 Windows 环境执行 `npm ci`，验证标签和两个配置版本一致，构建 NSIS 安装包，并自动创建公开 GitHub Release。版本不一致时工作流会失败，且不会发布错误版本。

## 发布后检查

在 GitHub 仓库的 Releases 页面确认版本状态为 Published，并下载 `爱思记_<版本>_x64-setup.exe` 到一台非开发机验收安装、启动和卸载。当前发布包尚未代码签名，Windows 可能显示未知发布者提示；代码签名属于独立发布安全工作，不在当前自动发布流程内。
