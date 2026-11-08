# 写作业机器人 📝

纯静态页面实现的 AI 作业助手：粘贴题目 → 调用大模型 API → 输出答案。三种工作模式（解题 / 作文 / 理科），支持 Markdown 渲染、LaTeX 公式、代码高亮。无需后端，直接丢到 GitHub Pages 就能用。

![tech](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS-blue) ![deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-2ea44f)

> **依赖已全部本地化**（`vendor/` 目录）。不加载任何外网 CDN，国内访问 GitHub Pages 也不会出现「Markdown 不渲染、满屏 `##` 和 `**`」的问题。

## 三种模式

| 模式 | 适用 | 输出 | 温度 |
| --- | --- | --- | --- |
| **解题模式** | 各科题目、代码题 | Markdown + LaTeX | 0.3 |
| **作文模式** | 高中议论文（假期作业） | **纯文本**，标题空 4 格、正文每段空 2 格，全角空格；正文后附 3 条改进建议 | 0.85 |
| **理科模式** | 数学 / 物理 / 化学 / 生物 | 审题 → 分步推导（标依据）→ 结果检验 → 最终答案 → 易错点 | 0.2 |

作文模式下，页面会**强制归一化排版**（不依赖模型自觉）：第一行标题前补 4 个全角空格，其余每个非空行前补 2 个全角空格，并去掉段间空行，右上角实时显示字数（不含空白）。输出区改用 `pre-wrap` 纯文本渲染，缩进不会被 Markdown 吃掉。

打印时不再用全角空格对齐，而是生成独立稿纸：标题居中、正文用 `text-indent: 2em` 首行缩进、宋体 12pt、A4 页边距 20×22mm，`@media print` 里把顶栏、输入区、按钮全部隐藏，只留稿纸。

## 功能

- 📥 题目输入：支持文字、LaTeX 公式、代码片段，`Ctrl/⌘ + Enter` 快速提交
- 🎓 科目选择：自动识别 / 数学 / 语文 / 英语 / 物理 / 化学 / 生物 / 编程
- 📏 回答深度：简洁版 / 标准版 / 详解版
- ✨ Markdown 渲染：标题、列表、表格、引用、代码块高亮，行内 `$...$` 与独立 `$$...$$` 公式由 KaTeX 渲染
- 🧯 兜底渲染：万一 `marked` 加载失败，内置的迷你渲染器也能正确显示标题、列表、代码、表格
- 🌊 流式输出：逐字显示，可中途「停止」
- 🖨 一键打印：A4 稿纸排版（标题居中、正文首行缩进 2 字符、宋体），只打印正文不打印页面外壳；作文的「改进建议」单独排在文末附录。直接按 `Ctrl/⌘ + P` 也走同一套稿纸
- 📋 一键复制文本 / HTML，或下载文件（作文存 `.txt`，解答存 `.md`）
- ⚙️ 页面内配置 API：Key 存在浏览器 `localStorage`，无需改代码重新部署
- 🛡️ DOMPurify 净化模型输出，防 XSS

## 文件结构

```
zuoyehelper/
├── index.html   # 页面结构
├── style.css    # 样式（深色主题）
├── app.js       # 交互逻辑 + API 调用 + Markdown 渲染 + 三种模式
├── config.js    # API 默认配置和模型清单
├── vendor/      # 本地依赖：marked / DOMPurify / KaTeX(+字体) / highlight.js
└── README.md
```

## 快速开始

### 1. 配置 API

两种方式，任选其一：

**方式 A（推荐）**：打开页面 → 右上角「⚙ 设置」→ 填接口地址、模型、API Key → 保存。
配置写入浏览器 `localStorage`，只对当前浏览器生效。

**方式 B**：编辑 [config.js](config.js)，直接填好 `endpoint` / `model` / `apiKey` 并提交到仓库。

### 2. 当前接入的服务

**Agnes AI**（OpenAI 兼容接口），已预置在 [config.js](config.js) 中：

| 项 | 值 |
| --- | --- |
| 接口地址 | `https://apihub.agnes-ai.com/v1/chat/completions` |
| 默认模型 | `agnes-3.0-flash`（质量优先） |
| 备选模型 | `agnes-2.5-flash`（更快，约 3 秒） |

已验证：CORS 允许跨域（`Access-Control-Allow-Origin: *`）、支持 SSE 流式输出，可从浏览器直接调用。

> `agnes-2.5-pro-*` 系列当前账号额度为 0，调用会返回 403 `insufficient_user_quota`。

换其他平台时的参考取值：

| 平台 | 接口地址 | 模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| Moonshot | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-plus` |
| 本地 Ollama | `http://localhost:11434/v1/chat/completions` | `qwen2.5:7b` |
| Claude | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet-20241022` |

Claude 需要选「Anthropic」模式，代码已自动带上浏览器直连所需请求头。

### 3. 本地预览

直接双击 `index.html` 即可（CDN 需要联网）。若浏览器限制 `file://` 下的请求，用任意静态服务器：

```bash
python -m http.server 8080
# 打开 http://localhost:8080
```

## 部署到 GitHub Pages

1. 把 `index.html`、`style.css`、`app.js`、`config.js` 和整个 `vendor/` 目录推到仓库（`vendor/` 不能漏，否则 Markdown 不渲染）；
2. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`；
3. 等 1 分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

> 如果仓库名是 `<用户名>.github.io`，则直接访问 `https://<用户名>.github.io/`。

## ⚠️ 安全与注意事项

- **当前 Key 已写在 [config.js](config.js) 里**：本地自用没问题，一旦推到公开仓库，任何人打开页面都能拿到并消耗你的额度。若只是自己用，建议改走「页面 ⚙ 设置」把 Key 存本地，然后把 config.js 里的 `apiKey` 清空再提交。
- **纯静态部署意味着 API Key 对访问者可见**（打开 DevTools 就能看到请求头）。请只用于自用/学习，使用**设置了额度上限的临时 Key**，切勿使用公司主账号 Key。
- 若要对公开放，建议自建一个极简代理（Cloudflare Workers / Vercel Edge Function），把 Key 放在服务端，前端只调用代理地址；此时把 `endpoint` 改成代理地址即可，其余代码无需改动。
- 浏览器直连要求 API 服务支持 **CORS**。Agnes AI、DeepSeek、OpenAI、Moonshot、智谱、通义均支持；若遇到 CORS 报错，请改用代理方案。
- 模型输出仅供参考，**请自行核对答案正确性**，尤其是计算题与证明题。
- 使用前请确认符合学校对 AI 工具的使用规定。

## 二次开发提示

- 解题模板：`app.js` 里的 `buildSystemPrompt()`（`solve` 分支）
- 作文提示词：`app.js` 里的 `ESSAY_PROMPT`（原文照录）；排版在 `normalizeEssay()`
- 理科提示词：`app.js` 里的 `SCIENCE_PROMPT`
- 作文/理科各自的随机性：`getTemperature()`
- 示例题目：`app.js` 里的 `EXAMPLES`
- 修改默认配置项：`config.js`
- 换主题色：`style.css` 顶部 `:root` 的 CSS 变量
- 更新前端依赖：把新文件放进 `vendor/` 并在 `index.html` 底部改引用路径即可（无构建步骤）
