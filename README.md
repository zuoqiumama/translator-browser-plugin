<div align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Translate Card icon">

  <h1>划词翻译卡片 · Translate Card</h1>

  <p><strong>Select text, translate in place. 选中文字，就在原地弹出翻译卡片。</strong></p>

  <p>
    <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square">
    <img alt="Chrome / Edge" src="https://img.shields.io/badge/Chrome%20%2F%20Edge-supported-34A853?style=flat-square">
    <img alt="No server" src="https://img.shields.io/badge/backend-not%20required-111827?style=flat-square">
    <img alt="Version" src="https://img.shields.io/badge/version-1.1.0-7C3AED?style=flat-square">
  </p>

  <p>
    一个轻量的浏览器划词翻译插件，不跳转、不打断阅读。<br>
    A lightweight browser extension for inline translation without leaving the page.
  </p>
</div>

## Preview · 功能预览

| Hover Lens · 悬停阅读透镜 | Translation Card · 翻译卡片 |
| --- | --- |
| <img src="img/透镜.png" width="520" alt="Hover lens screenshot"> | <img src="img/卡片.png" width="360" alt="Translation card screenshot"> |

## What's New · v1.1.0 更新亮点

- **多引擎对照 · Multi-engine compare**：卡片上点「对照」按钮，并排比较微软 / Google / DeepL / 大模型的译文，各自标注耗时，一眼看出哪个译得好。Compare several engines at once, side by side, each with its latency.
- **生词本 · Vocabulary book**：一键收藏词句到本地，独立管理页支持搜索、排序、备注、朗读，并可导出 CSV / Anki 或备份恢复 JSON。Save words with one click; search, sort, annotate, pronounce, and export to CSV / Anki / JSON.
- **复习模式 · Spaced-repetition review**：内置 Leitner 记忆卡片，认识 / 不认识两键复习（支持键盘），把生词本变成学习工具。Built-in flashcard review with spaced repetition.
- **AI 解释 · AI explain**：基于大模型流式输出词义、词性语法与例句，结合上下文消歧。Streamed LLM explanation (meaning / grammar / example) using the surrounding context.
- **更快 · Faster**：Service Worker 内译文缓存 + 悬停预取，重复翻译"秒出"、零网络。In-worker translation cache plus hover-prefetch make repeat lookups instant.

## Highlights · 核心特性

- **In-place translation · 原地翻译**：Select text on any webpage and open a translation card right next to the selection. 选中网页文字后，翻译按钮会出现在选区末尾，点一下就在当前位置打开卡片。
- **Pin, drag, compare · 钉住、拖动、多卡片对照**：Cards can be dragged anywhere. Pin one card, then select another phrase to open a new card for side-by-side comparison. 卡片可拖动到任意位置；钉住后继续划词会新开卡片，方便多段内容对照。
- **Hover reading lens · 悬停阅读透镜**：Move the cursor over a paragraph to reveal a lightweight inline translation, with smart skipping for buttons, menus, navigation, and text already in the target language. 鼠标划过段落即可展开译文，并自动跳过按钮、菜单、导航和已是目标语言的内容。
- **Context-aware translation · 上下文翻译**：When using an LLM provider, the surrounding paragraph can be sent together with the selection to reduce ambiguity. 使用大模型引擎时，可连同段落上下文一起发送，减少一词多义造成的误译。
- **Multiple providers · 多引擎可选**：Microsoft Translator works out of the box. Google, DeepL, OpenAI, OpenRouter, local Ollama, and custom OpenAI-compatible APIs are also supported. 默认微软翻译，无需 Key；也支持 Google、DeepL、OpenAI、OpenRouter、本地 Ollama 和自定义兼容接口。
- **Style isolation · 样式隔离**：The card is rendered inside Shadow DOM, so page styles will not break the extension and extension styles will not leak into the page. 卡片通过 Shadow DOM 渲染，不污染网页，也不被网页样式污染。
- **Polished details · 顺手细节**：Copy, text-to-speech, source text display, dark mode, keyboard shortcut, and context menu are built in. 内置复制译文、朗读译文、显示原文、深色模式、快捷键和右键菜单。

## Installation · 安装

Works with Chrome, Edge, and other Chromium-based browsers. The extension uses Manifest V3.

适用于 Chrome、Edge 等 Chromium 内核浏览器，扩展使用 Manifest V3。

### Option 1: Download a Release · 下载 Release

1. Open [Releases](https://github.com/zuoqiumama/translator-browser-plugin/releases) and download the latest `translator-browser-plugin-vX.Y.Z.zip`.
2. Unzip it into a stable folder. The browser loads the extension from this folder, so do not delete it after installation.
3. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
4. Enable **Developer mode / 开发者模式**.
5. Click **Load unpacked / 加载已解压的扩展程序** and choose the folder that contains `manifest.json`.
6. Pin the extension icon to the toolbar for quick access.

中文步骤：下载 Release 压缩包，解压到固定文件夹，打开扩展管理页，开启开发者模式，选择「加载已解压的扩展程序」，并选中包含 `manifest.json` 的目录。

### Option 2: Load from Source · 从源码加载

```bash
git clone https://github.com/zuoqiumama/translator-browser-plugin.git
```

Then open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the cloned project directory.

然后打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择 clone 下来的项目目录。

After updating the code, click the extension's refresh button on the extensions page. If you changed content scripts, refresh the target webpage as well.

更新代码后，在扩展管理页点击该扩展的「刷新」即可重新加载；如果改动影响内容脚本，还需要刷新目标网页。

## Usage · 使用方式

| Action · 操作 | Result · 效果 |
| --- | --- |
| Select text · 选中文字 | Shows a translate button at the end of the selection. 在选区末尾显示翻译按钮 |
| Auto translate · 选中即译 | Translate immediately after selection when enabled. 开启后选中文字会直接翻译 |
| `Alt+T` | Translate the current selection; configurable at `chrome://extensions/shortcuts`. 翻译当前选中文字，可在快捷键页修改 |
| Context menu · 右键菜单 | Choose "Translate selected text". 选择「翻译选中文字」 |
| Drag card header · 拖动卡片顶部 | Move the card anywhere; its position is remembered. 移动卡片并记住位置 |
| Pin card · 点击图钉 | Keep the current card and open a new one for the next selection. 固定当前卡片，之后划词会打开新卡片 |
| Change target language · 切换目标语言 | Re-translate immediately from the language dropdown. 选择语言后立即重译 |
| Copy / Speak · 复制 / 朗读 | Copy translated text or read it with browser TTS. 复制译文或朗读译文 |
| Compare · 对照 | Compare several engines side by side. 点「对照」并排比较多引擎译文 |
| Save · 收藏 | Save to the vocabulary book (bookmark icon). 点书签收藏到生词本 |
| Explain · 解释 | Stream an AI explanation in context (✦ icon). 点 ✦ 获取 AI 词义 / 语法 / 例句解释 |
| Review · 复习 | Open the vocabulary book → 复习 for spaced-repetition flashcards. 在生词本里点「复习」做记忆卡片 |
| `Esc` / Close · 关闭按钮 | Close the active card or a specific card. 关闭当前活动卡片或单张卡片 |

The toolbar popup lets you quickly change the target language, trigger mode, and provider. The full options page includes API keys, theme, TTS, source text display, and context-aware translation.

工具栏弹窗可以快速切换目标语言、触发方式和翻译引擎；完整选项页用于配置 API Key、主题、朗读、原文显示、上下文翻译等高级设置。

## Providers · 翻译引擎

| Provider · 引擎 | Best for · 适合场景 | Notes · 备注 |
| --- | --- | --- |
| Microsoft Translator · 微软翻译 | Out-of-the-box translation · 开箱即用 | Default provider, no API key required · 默认引擎，无需 API Key |
| Google | Lightweight free translation · 免费轻量翻译 | Requires access to Google services · 需要能访问 Google 服务 |
| DeepL | Higher-quality general translation · 更高质量的常规翻译 | Requires a DeepL API key; Free / Pro supported · 需要 DeepL API Key，支持 Free / Pro |
| OpenAI-compatible · OpenAI 兼容接口 | Context-aware translation and custom models · 上下文翻译、自定义模型 | Supports OpenAI, OpenRouter, Ollama, and self-hosted endpoints · 支持 OpenAI、OpenRouter、Ollama 和自建接口 |

OpenAI-compatible providers can be configured with:

自定义 OpenAI 兼容接口可配置：

- `Base URL`: `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1`, etc.
- `Model`: for example, `gpt-4o-mini`
- `API Key`: can be empty for local models

If you use a custom domain, grant host permission from the options page by clicking "Authorize this API domain".

如果使用自定义域名，需要在选项页点击「授权该接口域名」授予浏览器访问权限。

## Privacy & Security · 隐私与安全

- Text is sent to the selected translation provider only when you trigger translation. 只有在你触发翻译时，扩展才会把选中的文字发送给所选翻译引擎。
- API keys and settings are stored in browser `chrome.storage.sync`. API Key 和设置保存在浏览器 `chrome.storage.sync` 中。
- No analytics, telemetry, or tracking code is included. 项目不包含统计、埋点或追踪代码。
- Requests are sent from the extension Service Worker, so API keys are not exposed to the webpage. 翻译请求由 Service Worker 发起，避免把 API Key 暴露到网页环境。
- Translation content is rendered with `textContent`, not injected as HTML. 译文使用 `textContent` 写入卡片，不注入 HTML。

## Project Structure · 项目结构

```text
translate-card/
├─ manifest.json                 # MV3 extension manifest · 扩展配置
├─ src/
│  ├─ data.js                    # Languages and defaults · 语言列表和默认设置
│  ├─ translators.js             # Provider impls + AI explain stream · 各引擎 + AI 解释流式
│  ├─ cache.js                   # In-worker translation LRU cache · 译文缓存
│  ├─ background.js              # Service Worker, messages, menus, shortcuts
│  ├─ content-styles.js          # Shadow DOM card styles · 卡片样式
│  ├─ content.js                 # Selection detection and card UI · 划词检测和卡片 UI
│  ├─ vocab.js                   # Vocabulary store + spaced repetition · 生词本存储 + 复习调度
│  ├─ vocab.html / vocab-app.js  # Vocabulary manager page · 生词本管理页
│  ├─ review.html / review-app.js # Flashcard review page · 复习卡片页
│  ├─ popup.html / popup.js      # Toolbar popup · 工具栏弹窗
│  └─ options.html / options.js  # Full options page · 完整设置页
├─ icons/                        # Extension icons · 扩展图标
├─ img/                          # README screenshots · README 截图
└─ tools/gen-icons.js            # Icon generator · 图标生成脚本
```

## Development · 开发

Regenerate icons:

重新生成图标：

```bash
node tools/gen-icons.js
```

Load the development version:

加载开发版：

1. Enable Developer mode on the browser extensions page. 在浏览器扩展管理页开启开发者模式。
2. Choose the project root as an unpacked extension. 选择项目根目录作为「已解压的扩展程序」。
3. Click refresh on the extension card after editing code. 修改代码后点击扩展卡片上的「刷新」。
4. Refresh the target webpage if you changed `src/content.js` or `src/content-styles.js`. 如果修改了内容脚本或样式，也要刷新正在测试的网页。

## Firefox

The project follows Manifest V3. Recent Firefox versions support `background.service_worker`, but a production Firefox build may still need browser-specific manifest and API adjustments.

项目逻辑遵循 Manifest V3。较新版 Firefox 支持 `background.service_worker`，但如需正式适配，可能还需要调整后台脚本声明和浏览器 API 差异。当前主力适配目标是 Chrome / Edge。

## Known Limitations · 已知限制

- Browser internal pages such as `chrome://` and extension stores do not allow content scripts. `chrome://`、扩展商店等浏览器特殊页面无法注入内容脚本。
- The free Google endpoint is unofficial and may be unavailable in some network environments. Google 免费接口为非官方端点，部分网络环境可能不可用。
- Microsoft free tokens expire; the extension caches and refreshes them automatically. 微软免费令牌有有效期，扩展会自动缓存并提前刷新。
- Some sites with strict CSP may affect style injection; the extension prefers `adoptedStyleSheets` and falls back to `<style>`. 极少数站点的严格 CSP 可能影响样式注入，扩展已优先使用 `adoptedStyleSheets` 并回退到 `<style>`。
