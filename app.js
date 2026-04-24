"use strict";

const fileInput = document.getElementById("fileInput");
const loadDemoBtn = document.getElementById("loadDemoBtn");
const langToggleBtn = document.getElementById("langToggleBtn");
const chatEl = document.getElementById("chat");
const metaEl = document.getElementById("meta");
const languageContentMap = {
  zh: {
    title: "JSONL 对话查看器",
    loadDemo: "加载 docs 示例",
    langToggle: "English",
    metaSelectFile: "请选择一个 JSONL 文件。",
    emptyWaiting: "等待加载文件...",
    source: "来源",
    totalLines: "总行数",
    messages: "可展示消息",
    parseFailed: "解析失败",
    demoReadFailed: "示例文件读取失败",
    demoLoadFailed: "加载示例失败",
    noMessages: "没有可展示的消息。",
    unknownTool: "未知工具",
    toolCall: "工具调用",
    params: "参数",
    toolResult: "工具返回",
    errorSuffix: " (错误)",
    toolResultSimple: "工具结果",
    noVisualText: "无可视文本内容",
    expand: "展开",
    collapse: "折叠",
    roleUser: "用户",
    roleAssistant: "助手",
    roleTool: "工具",
    roleSystem: "系统",
  },
  en: {
    title: "JSONL Conversation Viewer",
    loadDemo: "Load docs demo",
    langToggle: "中文",
    metaSelectFile: "Please choose a JSONL file.",
    emptyWaiting: "Waiting for file...",
    source: "Source",
    totalLines: "Total lines",
    messages: "Displayable messages",
    parseFailed: "Parse failures",
    demoReadFailed: "Failed to read demo file",
    demoLoadFailed: "Failed to load demo",
    noMessages: "No messages to display.",
    unknownTool: "UnknownTool",
    toolCall: "Tool call",
    params: "Arguments",
    toolResult: "Tool result",
    errorSuffix: " (error)",
    toolResultSimple: "Tool output",
    noVisualText: "No visible text content",
    expand: "Expand",
    collapse: "Collapse",
    roleUser: "User",
    roleAssistant: "Assistant",
    roleTool: "Tool",
    roleSystem: "System",
  },
};
let currentLang = "zh";
let languageContent = languageContentMap[currentLang];
let latestSourceText = "";
let latestSourceName = "";
let latestRows = [];

applyLanguage();

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  latestSourceText = text;
  latestSourceName = file.name;
  renderFromText(latestSourceText, latestSourceName);
});

loadDemoBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("./docs/talent-labeler-batch-processing_claude.jsonl");
    if (!res.ok) {
      throw new Error(t("demoReadFailed"));
    }
    const text = await res.text();
    latestSourceText = text;
    latestSourceName = "docs/talent-labeler-batch-processing_claude.jsonl";
    renderFromText(latestSourceText, latestSourceName);
  } catch (err) {
    setEmpty(`${t("demoLoadFailed")}: ${err.message}`);
  }
});

langToggleBtn.addEventListener("click", () => {
  currentLang = currentLang === "zh" ? "en" : "zh";
  languageContent = languageContentMap[currentLang];
  applyLanguage();
  if (latestSourceText) {
    renderFromText(latestSourceText, latestSourceName);
  } else {
    setEmpty(t("emptyWaiting"));
  }
});

function renderFromText(text, sourceName) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const events = [];
  let parseErrorCount = 0;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      events.push(obj);
    } catch (error) {
      parseErrorCount += 1;
    }
  }

  const messageItems = normalizeEvents(events);
  latestRows = messageItems;
  renderMessages(messageItems);
  metaEl.textContent = `${t("source")}: ${sourceName} | ${t("totalLines")}: ${lines.length} | ${t("messages")}: ${messageItems.length} | ${t("parseFailed")}: ${parseErrorCount}`;
}

function normalizeEvents(events) {
  const rows = [];

  for (const event of events) {
    const role = inferRole(event);
    const chunks = extractTextChunks(event);

    if (chunks.length === 0) {
      // 保留关键系统事件，避免页面看起来像漏数据。
      if (event.type && event.type !== "file-history-snapshot") {
        rows.push({
          role: "system",
          text: `[${event.type}] ${t("noVisualText")}`,
          isTool: false,
        });
      }
      continue;
    }

    for (const chunk of chunks) {
      rows.push({
        role: chunk.role || role,
        text: chunk.text,
        isTool: chunk.isTool || false,
      });
    }
  }

  return rows;
}

function inferRole(event) {
  if (event.type === "user") return "user";
  if (event.type === "assistant") return "assistant";
  if (event.type === "tool" || event.toolUseResult) return "tool";
  if (event.message && event.message.role === "user") return "user";
  if (event.message && event.message.role === "assistant") return "assistant";
  return "system";
}

function extractTextChunks(event) {
  const chunks = [];

  // 常见结构: event.message.content 可能是字符串或数组
  const message = event.message;
  if (message) {
    if (typeof message.content === "string" && message.content.trim()) {
      chunks.push({ role: inferRole(event), text: message.content, isTool: false });
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!part) continue;
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          chunks.push({ role: inferRole(event), text: part.text, isTool: false });
        } else if (part.type === "tool_use") {
          const toolText = formatToolUse(part);
          chunks.push({ role: "assistant", text: toolText, isTool: true });
        } else if (part.type === "tool_result") {
          const toolResultText = formatToolResult(part);
          chunks.push({ role: "tool", text: toolResultText, isTool: true });
        }
      }
    }
  }

  // 有些行把工具结果放在 event.toolUseResult 字段
  if (event.toolUseResult) {
    chunks.push({
      role: "tool",
      text: `${t("toolResultSimple")}:\n` + safeJson(event.toolUseResult),
      isTool: true,
    });
  }

  // 兜底：直接展示 event.content 文本
  if (typeof event.content === "string" && event.content.trim()) {
    chunks.push({ role: inferRole(event), text: event.content, isTool: false });
  }

  return chunks;
}

function formatToolUse(part) {
  const name = part.name || t("unknownTool");
  const input = part.input ? safeJson(part.input) : "{}";
  return `${t("toolCall")}: ${name}\n${t("params")}:\n${input}`;
}

function formatToolResult(part) {
  const content = typeof part.content === "string" ? part.content : safeJson(part.content);
  const isError = part.is_error ? t("errorSuffix") : "";
  return `${t("toolResult")}${isError}:\n${content}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function renderMessages(items) {
  if (!items.length) {
    setEmpty(t("noMessages"));
    return;
  }

  chatEl.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    const align = item.role === "user" ? "right" : "left";
    row.className = `row ${align}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${item.isTool ? "tool" : ""}`.trim();

    const decodedText = decodeEscapedSequences(item.text);
    const content = document.createElement("div");
    content.className = "content";
    content.textContent = decodedText;

    const role = document.createElement("div");
    role.className = "role";
    role.textContent = roleLabel(item.role);

    const header = document.createElement("div");
    header.className = `bubble-header ${align}`;
    header.appendChild(role);

    if (shouldEnableCollapse(decodedText)) {
      content.classList.add("collapsed");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toggle-btn";
      button.textContent = t("expand");
      button.addEventListener("click", () => {
        const isCollapsed = content.classList.toggle("collapsed");
        button.textContent = isCollapsed ? t("expand") : t("collapse");
      });
      header.appendChild(button);
    }

    bubble.appendChild(header);
    bubble.appendChild(content);
    row.appendChild(bubble);
    chatEl.appendChild(row);
  }
}

function shouldEnableCollapse(text) {
  if (typeof text !== "string") return false;
  const lineCount = text.split("\n").length;
  return text.length > 500 || lineCount > 12;
}

function decodeEscapedSequences(text) {
  if (typeof text !== "string") return String(text);
  if (!text.includes("\\n") && !text.includes("\\t") && !text.includes("\\r")) {
    return text;
  }

  // 只在没有真实换行时做解码，避免二次处理已格式化文本。
  if (text.includes("\n")) {
    return text;
  }

  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"");
}

function roleLabel(role) {
  if (role === "user") return t("roleUser");
  if (role === "assistant") return t("roleAssistant");
  if (role === "tool") return t("roleTool");
  return t("roleSystem");
}

function setEmpty(text) {
  chatEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function t(key) {
  return languageContent[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  document.title = t("title");
  loadDemoBtn.textContent = t("loadDemo");
  langToggleBtn.textContent = t("langToggle");
  if (latestSourceText) {
    metaEl.textContent = metaEl.textContent;
    renderMessages(latestRows);
  } else {
    metaEl.textContent = t("metaSelectFile");
    setEmpty(t("emptyWaiting"));
  }
}
