# 划词翻译卡片 · Select to Translate

选中网页里的任意文字，**在原地弹出翻译卡片**——不跳转、不打断阅读。卡片常驻显示、可自由拖动到任意位置，按 `Esc` 或 ✕ 关闭。

![icon](icons/icon128.png)

## ✨ 特性

- **划词即译**：选中文字后，翻译按钮就出现在所选内容的**末尾**，点一下在原地出卡片。
- **常驻 + 可拖动 + 多卡片**：卡片可拖到任意位置。点 📌 **钉住**后该卡片常驻，之后再划词会**另开新卡片**，可同时摆多张对照；**未钉住**的那张卡片会被下次划词复用。`Esc` 关掉当前活动卡片、✕ 关单张。
- **悬停阅读透镜**（可开关，默认关）：开启后鼠标**划过段落**，译文卡片向下展开降落，用快速免费引擎即时显示并缓存。会**自动跳过**按钮/菜单/导航等界面元素，以及**已是目标语言**的文字（比如中文页面不再把中文“翻”成中文），所以在功能型网站上不会乱翻。
- **上下文翻译**（可开关，默认关）：划词时连同**所在段落**一起送给模型消歧，一词多义更准（按需发送、不预翻整页；仅大模型引擎生效）。
- **多引擎，开箱即用**
  - **微软翻译**（默认）— 免费、无需 Key、**国内可直连**。
  - **Google** — 免费，但需要能访问谷歌（国内通常需代理）。
  - **DeepL** — 质量高，需填 API Key（支持免费版 / Pro）。
  - **大模型 / OpenAI 兼容接口** — 可接 OpenAI、OpenRouter、本地 Ollama，或你自己的接口。
- **样式隔离**：卡片用 Shadow DOM 渲染，不会被网页样式污染，也不污染网页。
- **深色模式**：跟随系统，或手动浅色 / 深色。
- **顺手的小功能**：复制译文、朗读（TTS）、显示原文、自动检测源语言。
- **多种触发**：划词按钮 / 选中即译 / 快捷键 `Alt+T` / 右键「翻译选中文字」。

## 📦 安装

适用于 Chrome / Edge（Chromium 内核，Manifest V3）。

### 方式一：下载 Release（推荐，普通用户）

1. 到 **[Releases](https://github.com/zuoqiumama/translator-browser-plugin/releases)** 下载最新的 `translator-browser-plugin-vX.Y.Z.zip`。
2. **解压**到一个**不会删除**的固定文件夹（删了扩展就失效了）。
3. 打开扩展管理页：Chrome 输入 `chrome://extensions`，Edge 输入 `edge://extensions`。
4. 打开右上角 **开发者模式 / Developer mode**。
5. 点击 **加载已解压的扩展程序 / Load unpacked**，选择第 2 步解压出来的文件夹（里面应能看到 `manifest.json`）。
6. 建议把扩展图标固定到工具栏。

### 方式二：从源码加载（开发者 / 想要最新代码）

```bash
git clone https://github.com/zuoqiumama/translator-browser-plugin.git
```

然后同样打开 `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序**，选择 clone 下来的文件夹即可。

> 更新后，回到扩展管理页点该扩展的「刷新 ↻」即可生效（改了页面内逻辑还需刷新目标网页）。

## 🖱 使用

| 操作 | 效果 |
|------|------|
| 选中文字 | 选区**末尾**出现翻译按钮，点击弹出翻译卡片 |
| 📌 钉住 | 该卡片常驻；下次划词会**新开一张**卡片（可摆多张对照） |
| 划新词（未钉住时） | 复用当前那张未钉住的卡片，替换为新译文 |
| 拖动卡片顶部 | 把卡片移到任意位置（位置会被记住，不随下次翻译复位）|
| 卡片语言下拉 | 切换目标语言并立即重译 |
| 复制 / 朗读 图标 | 复制译文 / 朗读译文 |
| `Alt+T` | 翻译当前选中文字（可在 `chrome://extensions/shortcuts` 改键） |
| 右键菜单 | 「翻译选中文字」 |
| `Esc` / ✕ | `Esc` 关掉当前活动卡片；✕ 关闭单张 |

在工具栏图标的弹窗里可快速切换**目标语言 / 触发方式 / 引擎**；点「更多设置」进入完整设置页填 Key 等。

## ⚙️ 引擎与设置

设置页（右键扩展图标 → 选项，或弹窗里「更多设置」）可配置：

- **目标语言 / 触发方式 / 主题 / 是否显示原文 / 是否显示朗读按钮**
- **DeepL**：填入 API Key（免费 Key 申请：<https://www.deepl.com/pro-api>），可切换 Pro 接口。
- **大模型 / 自定义接口**：
  - Base URL，例如 `https://api.openai.com/v1`、`https://openrouter.ai/api/v1`、本地 `http://localhost:11434/v1`（Ollama）。
  - 模型名，例如 `gpt-4o-mini`。
  - API Key（本地模型可留空）。
  - **自定义域名需点「授权该接口域名」**授予访问权限（内置 host 权限只覆盖 `api.openai.com`）。
- **测试翻译**：设置页底部可直接验证当前引擎是否可用。

所有设置通过 `chrome.storage.sync` 自动保存并跨设备同步。

## 🗂 目录结构

```
translate-card/
├─ manifest.json            # MV3 配置
├─ src/
│  ├─ data.js               # 语言列表 + 默认设置（各处共享的唯一来源）
│  ├─ translators.js        # 各翻译引擎实现（仅在后台运行）
│  ├─ background.js         # Service Worker：消息分发 / 右键菜单 / 快捷键
│  ├─ content-styles.js     # 卡片样式（注入 Shadow DOM）
│  ├─ content.js            # 划词检测 + 卡片 UI + 拖动 / 关闭
│  ├─ popup.html / popup.js     # 工具栏弹窗（快速设置）
│  └─ options.html / options.js # 完整设置页
├─ icons/                   # 16/48/128 图标（由脚本生成）
└─ tools/gen-icons.js       # 零依赖图标生成脚本：node tools/gen-icons.js
```

## 🏗 架构要点

- 翻译请求统一在 **Service Worker** 里发起（不在页面里 `fetch`），这样既不受网页 CSP 限制，也避免把 API Key 暴露到页面环境。
- 内容脚本与后台通过 `chrome.runtime` 消息通信；译文用 `textContent` 写入，**不注入 HTML**，避免 XSS。
- 卡片挂在一个 `pointer-events:none` 的 Shadow Host 上，仅卡片本身可交互，不会挡住网页点击。

## 🔁 重新生成图标

```bash
node tools/gen-icons.js
```

## 🧩 关于 Firefox

代码遵循 MV3。较新版 Firefox 支持 `background.service_worker`；如需在 Firefox 上跑，可能需要把后台改为 `background.scripts`，其余逻辑通用。主力适配为 Chrome / Edge。

## ⚠️ 已知限制

- Google 免费接口为非官方端点，国内常被墙（已默认改用微软引擎）。
- 微软免费令牌有有效期（已自动缓存并提前刷新）。
- 极少数站点的严格 CSP 可能影响样式（已用 `adoptedStyleSheets` 规避，并回退到 `<style>`）。
- `chrome://`、扩展商店等特殊页面无法注入内容脚本（浏览器限制）。

## 🔒 隐私

- 仅在你触发翻译时，把**选中的文字**发送到你所选引擎的接口。
- API Key 等设置保存在浏览器的 `storage.sync`，不会上传到除翻译接口之外的任何地方。
- 无任何统计 / 追踪代码。
