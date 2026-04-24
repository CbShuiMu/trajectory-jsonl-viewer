"use strict";

const fileInput = document.getElementById("fileInput");
const loadDemoBtn = document.getElementById("loadDemoBtn");
const chatEl = document.getElementById("chat");
const metaEl = document.getElementById("meta");

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  renderFromText(text, file.name);
});

loadDemoBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("./docs/talent-labeler-batch-processing_claude.jsonl");
    if (!res.ok) {
      throw new Error("示例文件读取失败");
    }
    const text = await res.text();
    renderFromText(text, "docs/talent-labeler-batch-processing_claude.jsonl");
  } catch (err) {
    setEmpty(`加载示例失败：${err.message}`);
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
  renderMessages(messageItems);
  metaEl.textContent = `来源: ${sourceName} | 总行数: ${lines.length} | 可展示消息: ${messageItems.length} | 解析失败: ${parseErrorCount}`;
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
          text: `[${event.type}] 无可视文本内容`,
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
      text: "工具结果:\n" + safeJson(event.toolUseResult),
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
  const name = part.name || "UnknownTool";
  const input = part.input ? safeJson(part.input) : "{}";
  return `工具调用: ${name}\n参数:\n${input}`;
}

function formatToolResult(part) {
  const content = typeof part.content === "string" ? part.content : safeJson(part.content);
  const isError = part.is_error ? " (错误)" : "";
  return `工具返回${isError}:\n${content}`;
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
    setEmpty("没有可展示的消息。");
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
      button.textContent = "展开";
      button.addEventListener("click", () => {
        const isCollapsed = content.classList.toggle("collapsed");
        button.textContent = isCollapsed ? "展开" : "折叠";
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
  if (role === "user") return "用户";
  if (role === "assistant") return "助手";
  if (role === "tool") return "工具";
  return "系统";
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
