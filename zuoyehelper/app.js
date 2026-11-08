/* ============================================================
 * 写作业机器人 · 纯静态前端
 * 依赖（全部本地 vendor/）：marked / DOMPurify / KaTeX / highlight.js
 * 三种模式：解题 / 作文 / 理科
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);

  const els = {
    question: $("questionInput"),
    solveBtn: $("solveBtn"),
    exampleBtn: $("exampleBtn"),
    newChatBtn: $("newChatBtn"),
    charCount: $("charCount"),
    mode: $("modeSelect"),
    subjectField: $("subjectField"),
    depthField: $("depthField"),
    subject: $("subjectSelect"),
    depth: $("depthSelect"),
    inputTitle: $("inputTitle"),
    outputTitle: $("outputTitle"),
    wordCount: $("wordCount"),
    output: $("answerOutput"),
    statusBar: $("statusBar"),
    statusText: $("statusText"),
    copyMdBtn: $("copyMdBtn"),
    copyHtmlBtn: $("copyHtmlBtn"),
    dlMdBtn: $("dlMdBtn"),
    printBtn: $("printBtn"),
    printSheet: $("printSheet"),
    settingsBtn: $("settingsBtn"),
    settingsModal: $("settingsModal"),
    closeSettingsBtn: $("closeSettingsBtn"),
    cfgMode: $("cfgMode"),
    cfgEndpoint: $("cfgEndpoint"),
    cfgModel: $("cfgModel"),
    cfgApiKey: $("cfgApiKey"),
    cfgStream: $("cfgStream"),
    saveSettingsBtn: $("saveSettingsBtn"),
    testApiBtn: $("testApiBtn"),
    settingsMsg: $("settingsMsg"),
  };

  /* ---------------- 状态 ---------------- */
  const STORAGE_KEY = "zuoyehelper.api.v1";

  let rawMarkdown = "";   // 当前完整答案的原始文本
  let renderedHtml = "";  // 当前渲染后的 HTML
  let abortController = null;
  let isRunning = false;

  const DEFAULT_CONFIG = Object.assign(
    {
      mode: "openai-compat",
      endpoint: "https://apihub.agnes-ai.com/v1/chat/completions",
      model: "agnes-3.0-flash",
      apiKey: "",
      stream: true,
    },
    (typeof window.API_CONFIG === "object" && window.API_CONFIG) || {}
  );

  let config = loadConfig();

  function loadConfig() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (_) {
      saved = {};
    }
    return Object.assign({}, DEFAULT_CONFIG, saved);
  }

  function saveConfig(cfg) {
    config = Object.assign({}, config, cfg);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (_) {
      /* 隐私模式下可能失败，忽略 */
    }
  }

  /* ---------------- 工具 ---------------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isPlainMode() {
    return els.mode.value === "essay";
  }

  function solveBtnLabel() {
    if (els.mode.value === "essay") return "开始写作";
    if (els.mode.value === "science") return "开始解答";
    return "开始解题";
  }

  function getTemperature() {
    const mode = els.mode.value;
    if (mode === "essay") return 0.85;   // 作文要一点随机性
    if (mode === "science") return 0.2;  // 理科要稳定
    return 0.3;
  }

  /* ---------------- Markdown 渲染 ---------------- */
  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: true });
  }

  function renderMarkdown(md) {
    let html = "";
    try {
      html = window.marked ? marked.parse(md) : miniMarkdown(md);
    } catch (e) {
      html = miniMarkdown(md);
    }
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, { ADD_ATTR: ["target", "rel"] });
    }
    return html;
  }

  // 兜底渲染器：万一 marked 没加载成功，也不至于把 ## 和 ** 原样露出来
  function miniMarkdown(src) {
    const text = String(src || "");
    const blocks = [];
    const stash = (html) => "\u0000" + (blocks.push(html) - 1) + "\u0000";

    // 代码块 → 占位
    let s = text.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
      stash("<pre><code>" + escapeHtml(code) + "</code></pre>")
    );
    // 行内代码 → 占位
    s = s.replace(/`([^`\n]+)`/g, (m, code) => stash("<code>" + escapeHtml(code) + "</code>"));

    s = escapeHtml(s);
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[Number(i)]);

    // 标题
    s = s.replace(/^######[ \t]+(.*)$/gm, "<h6>$1</h6>");
    s = s.replace(/^#####[ \t]+(.*)$/gm, "<h5>$1</h5>");
    s = s.replace(/^####[ \t]+(.*)$/gm, "<h4>$1</h4>");
    s = s.replace(/^###[ \t]+(.*)$/gm, "<h3>$1</h3>");
    s = s.replace(/^##[ \t]+(.*)$/gm, "<h2>$1</h2>");
    s = s.replace(/^#[ \t]+(.*)$/gm, "<h1>$1</h1>");
    // 分隔线 / 引用
    s = s.replace(/^[ \t]*(---|\*\*\*)[ \t]*$/gm, "<hr>");
    s = s.replace(/^&gt;[ \t]?(.*)$/gm, "<blockquote>$1</blockquote>");
    // 列表
    s = s.replace(/^[ \t]*[-*+][ \t]+(.*)$/gm, "<li>$1</li>");
    s = s.replace(/^[ \t]*\d+\.[ \t]+(.*)$/gm, "<li>$1</li>");
    s = s.replace(/(<li>[\s\S]*?<\/li>)(?![\s\S]*?<li>)/g, "<ul>$1</ul>");
    // 粗体 / 斜体 / 删除线 / 链接
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    // 表格
    s = s.replace(
      /^\|(.+)\|[ \t]*$\r?\n^\|[\s:|-]+\|[ \t]*$\r?\n((?:^\|.*\|[ \t]*$\r?\n?)*)/gm,
      (m, head, body) => {
        const th = head.split("|").map((c) => c.trim()).filter(Boolean);
        const rows = body.trim().split(/\r?\n/).filter(Boolean).map((row) =>
          row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        );
        let t = "<table><thead><tr>" + th.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>";
        rows.forEach((r) => {
          t += "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>";
        });
        return t + "</tbody></table>";
      }
    );
    // 段落
    return s
      .split(/\n{2,}/)
      .map((chunk) => {
        const t = chunk.trim();
        if (!t) return "";
        if (/^<(h\d|ul|ol|pre|blockquote|table|hr)/.test(t)) return t;
        return "<p>" + t.replace(/\n/g, "<br>") + "</p>";
      })
      .join("\n");
  }

  // 作文排版归一化：标题空 4 格、正文每段空 2 格（全角空格），段间不留空行，
  // 不依赖模型自觉，避免出现「有时 2 格有时 4 格」「有时空行有时不空」
  function normalizeEssay(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    let first = true;
    for (let i = 0; i < lines.length; i++) {
      const body = lines[i].replace(/^[\s\u3000]+/, "").replace(/[\s\u3000]+$/, "");
      if (!body) continue;
      out.push((first ? "　　　　" : "　　") + body);
      first = false;
    }
    return out.join("\n");
  }

  // 渲染到页面并增强：公式 + 代码高亮 + 外链
  function paint(md) {
    const plain = isPlainMode();
    const text = plain ? normalizeEssay(md) : md;
    rawMarkdown = text;

    els.output.classList.toggle("plain-text", plain);
    els.output.classList.toggle("md-render", !plain);

    // 作文是「纯文本 + 全角空格缩进」，不能走 Markdown，否则缩进会被吃掉
    const html = plain ? escapeHtml(text) : renderMarkdown(text);
    renderedHtml = html;
    els.output.innerHTML = html;

    if (!plain) {
      if (window.renderMathInElement) {
        try {
          renderMathInElement(els.output, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "\\[", right: "\\]", display: true },
              { left: "$", right: "$", display: false },
              { left: "\\(", right: "\\)", display: false },
            ],
            throwOnError: false,
          });
        } catch (_) {}
      }

      if (window.hljs) {
        els.output.querySelectorAll("pre code").forEach((block) => {
          try {
            hljs.highlightElement(block);
          } catch (_) {}
        });
      }

      els.output.querySelectorAll("a[href]").forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
    }

    els.output.scrollTop = els.output.scrollHeight;
    updateWordCount(text);
    updateActions();
  }

  // 字数统计：不含空白的字符数，接近作文格子纸口径
  function updateWordCount(md) {
    if (!isPlainMode()) {
      els.wordCount.classList.add("hidden");
      els.wordCount.textContent = "";
      return;
    }
    const n = String(md || "").replace(/\s/g, "").length;
    els.wordCount.textContent = n ? n + " 字" : "";
    els.wordCount.classList.toggle("hidden", !n);
  }

  function updateActions() {
    const has = rawMarkdown.trim().length > 0;
    els.copyMdBtn.disabled = !has;
    els.copyHtmlBtn.disabled = !has;
    els.printBtn.disabled = !has;
    els.dlMdBtn.classList.toggle("is-disabled", !has);
    els.dlMdBtn.setAttribute("aria-disabled", String(!has));
  }

  function clearOutput() {
    rawMarkdown = "";
    renderedHtml = "";
    els.output.classList.remove("plain-text");
    els.output.classList.add("md-render");
    els.wordCount.classList.add("hidden");
    els.wordCount.textContent = "";

    const icon = isPlainMode() ? "✍️" : "🤖";
    const tip = isPlainMode()
      ? "作文将以纯文本输出，标题空 4 格、正文每段空 2 格（全角空格）"
      : "答案将以 Markdown 格式渲染，支持公式、代码高亮与表格";

    els.output.innerHTML =
      '<div class="placeholder"><div class="placeholder-icon">' + icon + "</div>" +
      "<p>在这里粘贴题目，点击「" + solveBtnLabel() + "」</p>" +
      '<p class="placeholder-sub">' + tip + "</p></div>";
    updateActions();
  }

  /* ---------------- 状态提示 ---------------- */
  function setStatus(text) {
    if (!text) {
      els.statusBar.classList.add("hidden");
      return;
    }
    els.statusText.textContent = text;
    els.statusBar.classList.remove("hidden");
  }

  function showError(msg) {
    const html = '<div class="answer-error"><strong>出错了：</strong>' + escapeHtml(msg) + "</div>";
    els.output.innerHTML = html;
    rawMarkdown = "";
    renderedHtml = html;
    updateActions();
  }

  /* ---------------- Prompt 构建 ---------------- */
  const SUBJECT_NAMES = {
    auto: "自动判断",
    math: "数学",
    chinese: "语文",
    english: "英语",
    physics: "物理",
    chemistry: "化学",
    biology: "生物",
    programming: "编程",
    other: "其他",
  };

  const DEPTH_RULES = {
    concise: "回答尽量精简：先给最终答案，再用 2~4 条要点说明思路，总长度控制在 300 字以内。",
    normal: "回答长度适中：给出完整解题过程与关键步骤，必要的公式推导要写清，最后附最终答案。",
    detailed: "回答尽量详细：逐步推导，解释每一步的依据与易错点，必要时补充知识点拓展与同类题提示。",
  };

  // 作文模式：系统提示词（按用户给定的原文）
  const ESSAY_PROMPT =
    "你是一个可以帮助高中生用户完成假期作业作文的AI工具，你需要帮助用户生成类似高中生议论文格式的议论文，以下是作文要求：" +
    "词藻平淡些，能多平淡就多平淡。尽量少使用引用论证的论证方式，模仿一个中等水平的学生的作文（类似60分满分得40分的水平），" +
    "字数只需输出约700字，可以多，但绝对不能少。" +
    "写作过程中，你需要把自己想象成人类，尽量模仿人类常用的语句，降低“AI率”。" +
    "你需要完成的作文以套话为主，格式为：首段引出论点，尾段概括全文，中间3段开头提出分论点、结尾总结分论点，" +
    "每段格式尽量统一；如第二段开头若为“xxx要xxx”，那第三段也为“xxx要xxx”，字数可以略微不同，尽量保持一致，" +
    "此处的“xxx要xxx”仅为示例，你可以根据具体的题目和要求将“要”替换为其他字。注意不要写小标题。" +
    "由于应试教育要求，请不要写身边的事例，这是不允许的。" +
    "作文要求尽量少的号召类话语和情感流露（即显得没有真情实感）。" +
    "题目要求使用对句，并尽量简短，符合作文题干要求。" +
    "输出请避免使用 Markdown 格式，标题空4格，正文每段空2格，空格均为全角空格符号（　）。" +
    "完成写作后，你需要提供大约3个改进建议，询问用户是否需要。" +
    "最后，请不要输出类似“要不要我帮你xxxx，使得xxxxx？”这样的话。";

  // 理科模式：自拟提示词
  const SCIENCE_PROMPT = [
    "你是一位带过多届高三的理科老师（数学、物理、化学、生物），擅长把题目拆成可以逐步复核的过程。",
    "",
    "作答要求：",
    "1. 用 Markdown 输出；数学内容一律使用 LaTeX：行内 $...$，独立公式 $$...$$。",
    "2. 先用一段【审题】写清：已知量、所求量、隐含条件（如 g 取 10 m/s²、标准状况、常温常压等）。题目没给的约定，要明确写出来。",
    "3. 主体分步编号推导，每一步只做一件事，并在该步末尾用一句“依据：……”说明用了哪个公式、定理或守恒关系。",
    "4. 代入数据必须带单位；中间结果保留 2~3 位有效数字；最终结果给出单位和方向（矢量题）。",
    "5. 公式中每个新符号第一次出现时，先定义含义和单位。",
    "6. 算完后做一次【结果检验】：量纲与数量级是否合理、极端情况是否说得通、有没有漏解或增根。",
    "7. 单独给出【最终答案】区块，按小问编号列出，只写结论不写过程。",
    "8. 最后给一行【易错点】，指出这道题最容易丢分的地方，最多 2 条。",
    "9. 需要画图时用文字描述结构（例如“受力分析：支持力 N 垂直斜面向上”），不要输出无法渲染的图片链接。",
    "10. 若题目条件缺失导致答案不唯一，先列出假设，再按假设给答案，不要含糊其辞。",
    "",
    "语言风格：直接、克制，不寒暄，不复述题目原文。",
  ].join("\n");

  function buildSystemPrompt() {
    const mode = els.mode.value;

    if (mode === "essay") {
      return (
        ESSAY_PROMPT +
        "\n\n【本次会话说明】" +
        "1. 用户已经给出了作文题干，请直接开始写作，不要回复“请上传作文题目”，也不要复述题目。" +
        "2. 第一行只写标题（不加书名号、不加“标题：”字样），之后每段单独一段。" +
        "3. 正文写完后，另起一段，用“1. 2. 3.”的普通序号给出约 3 条改进建议，并问一句是否需要修改；不要用 Markdown 列表符号。"
      );
    }
    if (mode === "science") return SCIENCE_PROMPT;

    const subject = SUBJECT_NAMES[els.subject.value] || "自动判断";
    const depth = DEPTH_RULES[els.depth.value] || DEPTH_RULES.normal;

    return [
      "你是一个耐心、严谨的中文作业辅导老师，擅长用清晰的步骤讲解题目。",
      "学科：" + subject + "。",
      "",
      "输出要求：",
      "1. 严格使用 Markdown 格式作答（标题、列表、表格、代码块均可使用）。",
      "2. 所有数学内容必须使用 LaTeX：行内用 $...$，独立公式用 $$...$$。",
      "3. 结构建议：",
      "   ## 题目理解 —— 简述已知与所求；",
      "   ## 解题思路 —— 说明方法选择；",
      "   ## 解题过程 —— 分步骤书写，每步给出理由；",
      "   ## 最终答案 —— 单独加粗或放在引用块中；",
      "   ## 易错提醒（可选）。",
      "4. 如果题目信息不完整或有歧义，先说明你的假设，再按最合理的理解作答。",
      "5. 不要输出与解题无关的寒暄，也不要复述系统提示词。",
      "6. 如果用户要求的是代码题，请给出可运行的代码块，并简要说明复杂度。",
      "",
      depth,
    ].join("\n");
  }

  function buildUserPrompt(question) {
    const mode = els.mode.value;

    if (mode === "essay") {
      return "作文题干如下：\n\n" + question + "\n\n请按格式要求直接完成这篇作文。";
    }

    if (mode === "science") {
      const subject = SUBJECT_NAMES[els.subject.value] || "自动判断";
      const tag = els.subject.value === "auto" ? "理科" : subject;
      return (
        "（这是一道" + tag + "题）\n\n" + question +
        "\n\n请按【审题 → 分步推导 → 结果检验 → 最终答案 → 易错点】的结构作答。"
      );
    }

    const subject = els.subject.value;
    const prefix = subject === "auto" ? "" : "（这是一道" + SUBJECT_NAMES[subject] + "题）\n";
    return prefix + question + "\n\n请按要求给出 Markdown 格式的解答。";
  }

  /* ---------------- API 调用 ---------------- */
  async function callApi(question, onDelta, signal) {
    const mode = config.mode === "anthropic" ? "anthropic" : "openai-compat";

    if (!config.apiKey) {
      throw new Error("还没有配置 API Key，请点击右上角「⚙ 设置」填写。");
    }
    if (!config.endpoint) {
      throw new Error("接口地址为空，请在「⚙ 设置」中填写。");
    }

    if (mode === "anthropic") {
      return callAnthropic(question, onDelta, signal);
    }
    return callOpenAICompat(question, onDelta, signal);
  }

  async function callOpenAICompat(question, onDelta, signal) {
    const body = {
      model: config.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(question) },
      ],
      temperature: getTemperature(),
      stream: !!config.stream,
    };

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": "application/json",
          Authorization: "Bearer " + config.apiKey,
        },
        config.extraHeaders || {}
      ),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(httpError(res.status, text));
    }

    if (!config.stream) {
      const data = await res.json();
      const content =
        (data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content) ||
        "";
      if (!content) {
        throw new Error("接口返回内容为空：" + JSON.stringify(data).slice(0, 300));
      }
      onDelta(content);
      return content;
    }

    return readSSE(
      res,
      onDelta,
      (json) => {
        if (json.error) throw new Error(json.error.message || "接口返回错误");
        const choice = json.choices && json.choices[0];
        if (!choice) return "";
        const delta = choice.delta || choice.message || {};
        return delta.content || "";
      },
      (json) =>
        (json.choices &&
          json.choices[0] &&
          ((json.choices[0].message && json.choices[0].message.content) ||
            json.choices[0].text)) ||
        ""
    );
  }

  async function callAnthropic(question, onDelta, signal) {
    const model = config.model || "claude-3-5-sonnet-20241022";
    const body = {
      model: model,
      max_tokens: 4096,
      temperature: getTemperature(),
      stream: !!config.stream,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(question) }],
    };

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(httpError(res.status, text));
    }

    if (!config.stream) {
      const data = await res.json();
      const content = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!content) throw new Error("接口返回内容为空");
      onDelta(content);
      return content;
    }

    return readSSE(
      res,
      onDelta,
      (json) => {
        if (json.type === "error") {
          throw new Error((json.error && json.error.message) || "接口返回错误");
        }
        if (json.type === "content_block_delta" && json.delta) {
          return json.delta.text || "";
        }
        return "";
      },
      (json) =>
        (json.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
    );
  }

  // 通用 SSE 读取器；wholeExtract 用于「请求了流式但返回整体 JSON」的兜底
  async function readSSE(res, onDelta, extract, wholeExtract) {
    if (!res.body || !res.body.getReader) {
      const text = await res.text();
      let full = parseWholeResponse(text, extract);
      if (!full && wholeExtract) {
        try {
          full = wholeExtract(JSON.parse(text)) || "";
        } catch (_) {}
      }
      if (full) onDelta(full);
      return full;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let full = "";
    let rawTail = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      rawTail = (rawTail + buffer).slice(-4000);

      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (!line || line.indexOf("data:") !== 0) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch (_) {
          continue;
        }
        const piece = extract(json);
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      }
    }

    if (!full && wholeExtract) {
      try {
        const json = JSON.parse((rawTail + buffer).trim());
        const whole = wholeExtract(json) || "";
        if (whole) {
          full = whole;
          onDelta(whole);
        }
      } catch (_) {}
    }
    return full;
  }

  function parseWholeResponse(text, extract) {
    let acc = "";
    text.split("\n").forEach((line) => {
      const t = line.trim();
      if (t.indexOf("data:") !== 0) return;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const piece = extract(JSON.parse(payload));
        if (piece) acc += piece;
      } catch (_) {}
    });
    return acc;
  }

  async function safeText(res) {
    try {
      return (await res.text()).slice(0, 500);
    } catch (_) {
      return "";
    }
  }

  function httpError(status, text) {
    const hints = {
      401: "认证失败，请检查 API Key 是否正确。",
      403: "无权限访问，可能是 Key 受限或额度不足。",
      404: "接口地址不存在，或模型名称写错。",
      429: "请求过于频繁或额度用尽，请稍后重试。",
      500: "服务端错误，请稍后重试。",
      502: "网关错误，请稍后重试。",
      503: "服务暂不可用，请稍后重试。",
    };
    const hint = hints[status] || "请求失败。";
    return hint + "（HTTP " + status + "）" + (text ? "\n" + text : "");
  }

  /* ---------------- 解题主流程 ---------------- */
  async function solve() {
    if (isRunning) {
      if (abortController) abortController.abort();
      return;
    }

    const question = els.question.value.trim();
    if (!question) {
      els.question.focus();
      els.question.style.borderColor = "var(--danger)";
      setTimeout(() => (els.question.style.borderColor = ""), 1200);
      return;
    }

    if (!config.apiKey) {
      openSettings();
      setSettingsMsg("请先填写 API Key 再开始。", "err");
      return;
    }

    isRunning = true;
    els.solveBtn.innerHTML = '<span class="btn-icon">■</span> 停止';
    abortController = new AbortController();

    setStatus(els.mode.value === "essay" ? "AI 正在写作…" : "AI 正在思考…");
    els.output.classList.remove("plain-text", "md-render");
    els.output.innerHTML =
      '<div class="placeholder"><div class="placeholder-icon">🧠</div><p>正在分析题目…</p></div>';

    let acc = "";
    let frame = null;

    const schedulePaint = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        paint(acc);
      });
    };

    try {
      await callApi(
        question,
        (delta) => {
          acc += delta;
          schedulePaint();
        },
        abortController.signal
      );

      if (!acc.trim()) {
        paint("> ⚠️ 模型没有返回任何内容，请重试或更换模型。");
      } else {
        paint(acc);
      }
      setStatus("");
    } catch (err) {
      const aborted = err && (err.name === "AbortError" || err.code === 20);
      if (aborted) {
        setStatus("");
        if (acc.trim()) {
          paint(acc + (isPlainMode() ? "\n\n（已手动停止生成）" : "\n\n> ⏹ 已手动停止生成。"));
        } else {
          clearOutput();
        }
      } else {
        setStatus("");
        showError((err && err.message) || String(err));
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      isRunning = false;
      abortController = null;
      els.solveBtn.innerHTML = '<span class="btn-icon">⚡</span> ' + solveBtnLabel();
    }
  }

  /* ---------------- 设置界面 ---------------- */
  function openSettings() {
    els.cfgMode.value = config.mode || "openai-compat";
    els.cfgEndpoint.value = config.endpoint || "";
    els.cfgModel.value = config.model || "";
    els.cfgApiKey.value = config.apiKey || "";
    els.cfgStream.checked = config.stream !== false;
    setSettingsMsg("");
    els.settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    els.settingsModal.classList.add("hidden");
  }

  function setSettingsMsg(text, type) {
    els.settingsMsg.textContent = text || "";
    els.settingsMsg.className = "settings-msg" + (type ? " " + type : "");
  }

  function readForm() {
    return {
      mode: els.cfgMode.value,
      endpoint: els.cfgEndpoint.value.trim(),
      model: els.cfgModel.value.trim(),
      apiKey: els.cfgApiKey.value.trim(),
      stream: els.cfgStream.checked,
    };
  }

  function doSaveSettings() {
    const cfg = readForm();
    if (!cfg.endpoint) return setSettingsMsg("接口地址不能为空。", "err");
    if (!/^https?:\/\//i.test(cfg.endpoint)) {
      return setSettingsMsg("接口地址需以 http:// 或 https:// 开头。", "err");
    }
    if (!cfg.apiKey) return setSettingsMsg("API Key 不能为空。", "err");
    if (!cfg.model) return setSettingsMsg("模型名称不能为空。", "err");

    saveConfig(cfg);
    setSettingsMsg("已保存 ✓ 配置仅存于本浏览器。", "ok");
    setTimeout(closeSettings, 700);
  }

  async function testConnection() {
    const cfg = readForm();
    if (!cfg.apiKey) return setSettingsMsg("请先填写 API Key。", "err");
    if (!cfg.endpoint) return setSettingsMsg("请先填写接口地址。", "err");

    const prev = config;
    config = Object.assign({}, config, cfg, { stream: false });

    setSettingsMsg("正在测试连接…");
    els.testApiBtn.disabled = true;
    try {
      let got = "";
      await callApi("请只回复两个字：你好", (d) => (got += d), undefined);
      setSettingsMsg("连接成功 ✓ 模型回复：" + got.slice(0, 40), "ok");
    } catch (err) {
      setSettingsMsg("连接失败：" + ((err && err.message) || err), "err");
    } finally {
      els.testApiBtn.disabled = false;
      config = prev;
    }
  }

  /* ---------------- 打印 ---------------- */
  // 作文：标题居中 + 正文首行缩进 2 字符（用 CSS 缩进，不依赖全角空格对齐）
  // 解题/理科：打印渲染后的富文本
  function fillPrintSheet() {
    const sheet = els.printSheet;
    if (!sheet) return;

    if (!rawMarkdown.trim()) {
      sheet.innerHTML =
        '<p style="text-indent:0;color:#666">（当前没有可打印的内容，请先生成答案）</p>';
      return;
    }

    if (isPlainMode()) {
      const lines = rawMarkdown
        .split(/\r?\n/)
        .map((s) => s.replace(/^[\s\u3000]+/, "").replace(/[\s\u3000]+$/, ""))
        .filter(Boolean);

      const title = lines.shift() || "";

      // 正文后面那段「1. 2. 3.」改进建议，单独排成附录，不跟作文混在一起
      let cut = lines.findIndex((l) => /^\d+[.、．)]/.test(l));
      if (cut <= 0) cut = lines.length;

      const body = lines.slice(0, cut);
      const notes = lines.slice(cut);

      let html = '<h1 class="print-title">' + escapeHtml(title) + "</h1>";
      html += body.map((l) => "<p>" + escapeHtml(l) + "</p>").join("");
      if (notes.length) {
        html +=
          '<div class="print-appendix"><p class="print-appendix-title">改进建议</p>' +
          notes.map((l) => "<p>" + escapeHtml(l) + "</p>").join("") +
          "</div>";
      }
      sheet.innerHTML = html;
    } else {
      sheet.innerHTML = '<div class="print-md">' + renderedHtml + "</div>";
    }
  }

  function doPrint() {
    fillPrintSheet();
    window.print();
  }

  /* ---------------- 复制 / 下载 ---------------- */
  async function copyText(text, btn, okLabel) {
    if (!text) return;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    btn.textContent = okLabel;
    setTimeout(() => (btn.textContent = original), 1200);
  }

  function updateDownloadHref() {
    if (!rawMarkdown) return false;
    const plain = isPlainMode();
    const blob = new Blob([rawMarkdown], {
      type: (plain ? "text/plain" : "text/markdown") + ";charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    if (els.dlMdBtn.dataset.url) URL.revokeObjectURL(els.dlMdBtn.dataset.url);
    els.dlMdBtn.dataset.url = url;
    els.dlMdBtn.href = url;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    els.dlMdBtn.download = (plain ? "作文-" : "作业解答-") + stamp + (plain ? ".txt" : ".md");
    return true;
  }

  /* ---------------- 示例 ---------------- */
  const EXAMPLES = {
    solve:
      "已知函数 $f(x) = x^3 - 3x^2 + 2$。\n\n" +
      "(1) 求 $f(x)$ 的单调区间与极值；\n" +
      "(2) 求曲线 $y = f(x)$ 在点 $(2, f(2))$ 处的切线方程。",
    essay:
      "阅读下面的材料，根据要求写作。\n\n" +
      "有人说，年轻人应当“把时间花在刀刃上”，只做有用的事；" +
      "也有人说，那些看似无用的爱好，恰恰构成了生活的底色。\n\n" +
      "以上材料引发了你怎样的思考？请写一篇议论文。\n" +
      "要求：自拟标题，观点明确，不少于 700 字。",
    science:
      "质量 $m = 2\\,\\mathrm{kg}$ 的物体放在倾角 $\\theta = 30^\\circ$ 的斜面上，" +
      "物体与斜面间的动摩擦因数 $\\mu = 0.2$。现用沿斜面向上的拉力 $F = 20\\,\\mathrm{N}$ 拉物体，" +
      "取 $g = 10\\,\\mathrm{m/s^2}$。\n\n" +
      "(1) 求物体的加速度大小；\n" +
      "(2) 若拉力作用 $2\\,\\mathrm{s}$ 后撤去，求物体还能沿斜面向上滑行的距离。",
  };

  /* ---------------- 模式切换 ---------------- */
  function applyMode() {
    const mode = els.mode.value;
    const plain = mode === "essay";

    // 作文模式用不到科目/深度
    els.subjectField.classList.toggle("hidden", plain);
    els.depthField.classList.toggle("hidden", plain);

    els.inputTitle.textContent = plain ? "作文题干输入" : mode === "science" ? "理科题目输入" : "题目输入";
    els.outputTitle.textContent = plain ? "作文结果" : mode === "science" ? "解答结果" : "解题结果";

    els.solveBtn.innerHTML = '<span class="btn-icon">⚡</span> ' + solveBtnLabel();
    els.exampleBtn.textContent = plain ? "填入示例题干" : "填入示例题目";

    els.question.placeholder = plain
      ? "把作文题干粘贴到这里…\n\n可以只给材料和要求，标题让 AI 自己拟；\n如果题干已经规定了标题，请一并写进来。"
      : "把题目粘贴到这里…\n\n支持：\n· 文字题目\n· LaTeX 公式（如 $E=mc^2$）\n· 代码片段（用 ``` 包裹）";

    // 作文模式不需要「复制 HTML」
    els.copyHtmlBtn.classList.toggle("hidden", plain);

    clearOutput();
  }

  /* ---------------- 事件绑定 ---------------- */
  els.solveBtn.addEventListener("click", solve);

  els.mode.addEventListener("change", applyMode);

  els.question.addEventListener("input", () => {
    const len = els.question.value.length;
    els.charCount.textContent = len + " 字";
  });

  els.question.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      solve();
    }
  });

  els.exampleBtn.addEventListener("click", () => {
    els.question.value = EXAMPLES[els.mode.value] || EXAMPLES.solve;
    els.question.dispatchEvent(new Event("input"));
    els.question.focus();
  });

  els.newChatBtn.addEventListener("click", () => {
    if (isRunning && abortController) abortController.abort();
    els.question.value = "";
    els.question.dispatchEvent(new Event("input"));
    clearOutput();
    setStatus("");
    els.question.focus();
  });

  els.settingsBtn.addEventListener("click", openSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.settingsModal.classList.contains("hidden")) {
      closeSettings();
    }
  });

  els.saveSettingsBtn.addEventListener("click", doSaveSettings);
  els.testApiBtn.addEventListener("click", testConnection);

  els.cfgMode.addEventListener("change", () => {
    if (els.cfgMode.value === "anthropic") {
      if (!els.cfgEndpoint.value.trim()) {
        els.cfgEndpoint.value = "https://api.anthropic.com/v1/messages";
      }
      if (!els.cfgModel.value.trim()) {
        els.cfgModel.value = "claude-3-5-sonnet-20241022";
      }
    } else {
      if (!els.cfgEndpoint.value.trim()) {
        els.cfgEndpoint.value =
          (typeof window.API_CONFIG === "object" && window.API_CONFIG.endpoint) ||
          "https://apihub.agnes-ai.com/v1/chat/completions";
      }
      if (!els.cfgModel.value.trim()) els.cfgModel.value = "agnes-3.0-flash";
    }
  });

  els.printBtn.addEventListener("click", doPrint);
  // 直接按 Ctrl+P 时也保证打印的是干净稿纸，而不是整个页面
  window.addEventListener("beforeprint", fillPrintSheet);

  els.copyMdBtn.addEventListener("click", () =>
    copyText(rawMarkdown, els.copyMdBtn, "已复制 ✓")
  );
  els.copyHtmlBtn.addEventListener("click", () =>
    copyText(isPlainMode() ? rawMarkdown : renderedHtml, els.copyHtmlBtn, "已复制 ✓")
  );
  els.dlMdBtn.addEventListener("mouseenter", updateDownloadHref);
  els.dlMdBtn.addEventListener("focus", updateDownloadHref);
  els.dlMdBtn.addEventListener("click", (e) => {
    if (!updateDownloadHref()) e.preventDefault();
  });

  /* ---------------- 初始化 ---------------- */
  (function fillModelList() {
    const dl = $("modelList");
    const models = Array.isArray(window.AGNES_MODELS) ? window.AGNES_MODELS : [];
    if (!dl || !models.length) return;
    dl.innerHTML = models
      .map((m) => '<option value="' + escapeHtml(m) + '"></option>')
      .join("");
  })();

  applyMode();
  els.question.focus();
})();
