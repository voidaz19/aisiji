# 平台映射与差异

本页把设计令牌映射到执行代码，防止新增页面绕过主题，也防止跨端实现时误以为所有数值已经一致。

## 主题入口

| 平台 | 主题入口 | 主题切换 | 令牌消费方式 |
|---|---|---|---|
| Android Compose | `app/src/main/java/com/aisi/note/design/theme/Theme.kt` 的 `AiSiJiTheme` | `isSystemInDarkTheme()`；调试页可临时覆盖部分浅色角色 | `MaterialTheme.colorScheme`、`typography`、`shapes`。 |
| Web/Electron shell | `apps/web/src/styles.css` | `apps/web/src/appTheme.ts` 将解析结果写入 `data-theme` | `--asj-color-*`、`--asj-radius-*`、`--asj-shadow-*`、`--asj-motion-*`。 |
| 共享 CodeMirror（桌面） | `packages/codemirror-runtime/src/theme.ts` | 调用方传入 `light` / `dark` | 优先读取 Web `--asj-*` 变量，Markdown 局部样式在主题模块内定义。 |
| 共享 CodeMirror（Android WebView） | `packages/codemirror-runtime/src/android.css` | WebView 根节点 `data-theme` | 自己声明最小的一组 `--asj-*` 变量。 |

## 共享与平台专属值

### 已对齐的日间基础值

`Theme.kt` 的 `Ink / Paper / MistSurface / Leaf / LeafSoft / Gold / GoldSoft / Clay` 与桌面 `styles.css` 的日间基础变量一致。新增日间跨端色彩时应先扩展这组语义角色。

Android 的 Material 映射如下：

| 语义 | Material 角色 |
|---|---|
| 叶绿 | `primary` / `tertiary` |
| 淡叶绿 | `primaryContainer` / `tertiaryContainer` |
| 金色 | `secondary` |
| 淡金色 | `secondaryContainer` |
| 纸面/白色 | `background` / `surface` |
| 雾面 | `surfaceVariant` |
| 陶土色 | `error` |

### 当前不能假定相同的深色模式

| 角色 | Android Compose | Web/Electron | Android CodeMirror |
|---|---:|---:|---:|
| 主背景 | `#151712` | `#111611` | `#171A18` |
| 主 surface | `#20231D` | `#1A211A` | 使用主背景 |
| 主文字 | `#F5EFE2` | `#EDF3EC` | `#EDF3EC` |
| 弱文字 | `#C6CCBE` | `#A5B1A6` | `#AEB9AD` |
| 主绿色 | `#AAD7BE` | `#7DBB96` | `#90CFA7` |

这些差异来自当前实际实现，尤其 Android 正文 WebView 与 Compose 的背景不完全相同。新增深色模式视觉时，必须分别在三处验收；在统一生成主题之前，不得只改一端后声称已跨端同步。

## 形状、阴影与字体

| 设计角色 | Android | Web/Electron | CodeMirror |
|---|---|---|---|
| 8 / 12 / 18 / 24 / 30 圆角 | `AppShapes` | `--asj-radius-xs…xl` | 引用 8、12px 局部规则。 |
| 柔和阴影 | `Modifier.softShadow`；按组件尺寸缩放，默认 alpha 0.08 | `--asj-shadow-soft-sm/md/lg` | 图片局部使用独立弱阴影。 |
| 文楷 | `LxgwWenKai` 字体资源 | `@font-face` + `--asj-font-sans` | 桌面继承 `--asj-editor-font`；Android 自行声明字体资源。 |
| 减少动态效果 | Compose 动画遵循各功能状态 | CSS `prefers-reduced-motion` 关闭弹层动画 | 任务过渡等局部动效需在宿主策略下验收。 |

`softShadow` 不是 CSS box-shadow 的逐像素等价物：Android 使用 `BlurMaskFilter`，且根据组件尺寸收缩/放大扩散范围；跨端应追求相同层级感，而不是直接照搬像素。

## 变更检查清单

1. 新增的是语义令牌还是仅某组件的布局参数？前者必须写入 `tokens.json`。
2. 该令牌是否需要 Android、Web/Electron、Android CodeMirror 三端支持？逐端列出实际修改位置。
3. 日间、夜间、长文本、最小宽度与减少动态效果是否均验收？
4. 新组件是否复用了已有配方，且没有额外硬编码颜色、圆角、阴影？
5. 若主题差异是故意保留，是否在本文件的差异表中记录了原因？
