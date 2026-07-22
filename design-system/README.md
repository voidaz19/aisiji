# 爱思记设计系统

这是爱思记跨 Android、桌面端和共享 CodeMirror 编辑器的设计语言提取目录。它服务于新页面设计、跨端实现和视觉评审；不是另一套运行时代码。

## 从这里开始

| 文件 | 作用 |
|---|---|
| `tokens.json` | 机器可读的颜色、圆角、阴影、动效与字体令牌；适合工具、原型或后续代码生成消费。 |
| `design-language.md` | 产品的视觉原则、排版、层次、交互与无障碍约束。 |
| `component-recipes.md` | 已落地组件的组合规则与尺寸，供新增页面复用。 |
| `platform-mapping.md` | 令牌在 Android、Web/Electron 与 CodeMirror 中的真实实现位置及差异。 |

## 使用规则

1. 新界面先选择语义角色（例如 `primary`、`surface-muted`），不要凭感觉新增近似颜色、圆角或阴影。
2. Android 使用 `MaterialTheme.colorScheme`、`MaterialTheme.typography`、`MaterialTheme.shapes` 和 `softShadow`；Web/Electron 使用 `--asj-*` CSS 变量；CodeMirror 只使用其主题模块提供的令牌。
3. 需要新增令牌时，先修改本目录的 `tokens.json` 和相应规范，再同步修改各平台实现与本目录的映射。不要只改某个页面的硬编码值。
4. 本目录记录的是当前产品事实；基准/调试页中的临时颜色和用户可配置调试主题不属于默认设计语言。

## 事实来源与维护边界

运行时主题尚未由一个生成器统一产出，因此下列实现文件仍是各平台的直接执行来源：

- Android：`app/src/main/java/com/aisi/note/design/theme/Theme.kt`、`SoftShadow.kt`
- Web/Electron：`apps/web/src/styles.css`、`apps/web/src/appTheme.ts`
- 共享编辑器：`packages/codemirror-runtime/src/theme.ts`、`packages/codemirror-runtime/src/android.css`

`tokens.json` 是跨端设计决策的审阅入口，`platform-mapping.md` 列出不能假定一致的差异。变更视觉基础值时，维护者应在同一次变更中更新这两个文件和受影响的平台实现；否则设计规范会过期。
