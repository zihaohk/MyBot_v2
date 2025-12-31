function formatMemory(memoryObject, memoryTurns) {
  const turns = Array.isArray(memoryObject?.turns) ? memoryObject.turns : [];
  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  const recent = turns.slice(Math.max(0, turns.length - keep));

  if (recent.length === 0) {
    return "（当前暂无已保存的对话记忆）";
  }

  // Keep it plain and deterministic, easy to audit/edit
  let out = `以下是你与用户最近 ${recent.length} 轮（1轮=用户1句+助手1句）的对话记忆，请用作上下文参考：\n`;
  for (let i = 0; i < recent.length; i++) {
    const t = recent[i];
    out += `\n[Round ${i + 1} | ${t.ts}]\nUser: ${t.user}\nAssistant: ${t.assistant}\n`;
  }
  return out.trim();
}

/**
 * Strictly follow: persona -> memory -> latest user message.
 * We implement it as messages array order:
 * 1) system persona
 * 2) system memory
 * 3) user message
 */
function buildMessages({ prePromptMarkdown, personaMarkdown, memoryObject, memoryTurns, userMessage }) {
  const persona = typeof personaMarkdown === "string" ? personaMarkdown : "";
  const memText = formatMemory(memoryObject, memoryTurns);

  const messages = [
    { role: "system", content: `你必须严格按照以下人设与用户对话。\n\n${persona}` },
    { role: "system", content: memText },
    { role: "user", content: userMessage }
  ];
  if (typeof prePromptMarkdown === "string" && prePromptMarkdown.trim()) {
    messages.unshift({ role: "system", content: prePromptMarkdown.trim() });
  }
  return messages;
}

module.exports = {
  buildMessages
};
