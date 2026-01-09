import { els } from "../dom.js";

const AUTO_SCROLL_THRESHOLD_PX = 32;

export function scrollToBottom(options = {}) {
  if (!els.chatList) return;
  const behavior = options.behavior || "smooth";
  els.chatList.scrollTo({
    top: els.chatList.scrollHeight,
    behavior
  });
}

export function splitMessageLines(text) {
  return String(text).split("$").filter(line => line.length > 0);
}

export function fillUserBubbles(container, text, animate = false) {
  container.innerHTML = "";
  const lines = splitMessageLines(text);
  const safeLines = lines.length > 0 ? lines : [""];
  for (const line of safeLines) {
    const bubble = document.createElement("div");
    bubble.className = "bubble user";
    if (animate) bubble.classList.add("pop");
    bubble.textContent = line;
    container.appendChild(bubble);
  }
}

export function fillBotBubbles(container, text, animate = false) {
  container.innerHTML = "";
  const lines = splitMessageLines(text);
  const safeLines = lines.length > 0 ? lines : [""];
  const lastIndex = safeLines.length - 1;
  for (let i = 0; i < safeLines.length; i += 1) {
    const line = safeLines[i];
    const bubble = document.createElement("div");
    bubble.className = "bubble bot";
    if (animate && i === lastIndex) bubble.classList.add("pop");
    bubble.textContent = line;
    container.appendChild(bubble);
  }
}

export function createLoadingBubble(animate = false) {
  const bubble = document.createElement("div");
  bubble.className = "bubble bot loading";
  if (animate) bubble.classList.add("pop");
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  return bubble;
}

export function renderTurn(turn, assistantOverride, isLoading, animateAssistant) {
  const assistantText = typeof assistantOverride === "string" ? assistantOverride : turn.assistant;

  const userRow = document.createElement("div");
  userRow.className = "row user";
  const userWrap = document.createElement("div");
  const userBubbleStack = document.createElement("div");
  userBubbleStack.className = "bubble-stack";
  fillUserBubbles(userBubbleStack, turn.user, false);
  const userMeta = document.createElement("div");
  userMeta.className = "meta";
  userMeta.style.textAlign = "right";
  userMeta.textContent = turn.ts;
  userWrap.appendChild(userBubbleStack);
  userWrap.appendChild(userMeta);
  userRow.appendChild(userWrap);

  const botRow = document.createElement("div");
  botRow.className = "row bot";
  const botWrap = document.createElement("div");
  const botBubbleStack = document.createElement("div");
  botBubbleStack.className = "bubble-stack";
  if (isLoading) {
    botBubbleStack.appendChild(createLoadingBubble(false));
  } else {
    fillBotBubbles(botBubbleStack, assistantText, Boolean(animateAssistant));
  }
  const botMeta = document.createElement("div");
  botMeta.className = "meta";
  botMeta.textContent = turn.ts;
  botWrap.appendChild(botBubbleStack);
  botWrap.appendChild(botMeta);
  botRow.appendChild(botWrap);

  els.chatList.appendChild(userRow);
  els.chatList.appendChild(botRow);
}

export function renderMemory(memory, options = {}) {
  const preserveScroll = options.preserveScroll === true;
  const scrollState = preserveScroll && els.chatList
    ? (() => {
        const { scrollTop, scrollHeight, clientHeight } = els.chatList;
        const distanceFromBottom = Math.max(0, scrollHeight - (scrollTop + clientHeight));
        return {
          distanceFromBottom,
          nearBottom: distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX
        };
      })()
    : null;

  els.chatList.innerHTML = "";
  const turns = Array.isArray(memory?.turns) ? memory.turns : [];
  const hasPending = memory?.status === "pending";
  const animateLastAssistant = Boolean(options.animateLastAssistant);
  const scrollBehavior = options.scrollBehavior || "auto";
  const lastIdx = turns.length - 1;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const isLoading = hasPending && i === lastIdx;
    const animateAssistant = animateLastAssistant && i === lastIdx && !isLoading;
    renderTurn(t, undefined, isLoading, animateAssistant);
  }
  if (preserveScroll && scrollState && !scrollState.nearBottom) {
    const nextTop = Math.max(
      0,
      els.chatList.scrollHeight - els.chatList.clientHeight - scrollState.distanceFromBottom
    );
    els.chatList.scrollTop = nextTop;
    return;
  }
  scrollToBottom({ behavior: scrollBehavior });
}

export function addTempUserMessage(text, tsOverride) {
  const ts = typeof tsOverride === "string" ? tsOverride : new Date().toISOString();
  const row = document.createElement("div");
  row.className = "row user";
  const wrap = document.createElement("div");
  const bubbleStack = document.createElement("div");
  bubbleStack.className = "bubble-stack";
  fillUserBubbles(bubbleStack, text, true);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.style.textAlign = "right";
  meta.textContent = ts;
  wrap.appendChild(bubbleStack);
  wrap.appendChild(meta);
  row.appendChild(wrap);
  els.chatList.appendChild(row);
  scrollToBottom();
  return { row, bubbleStack, meta, ts };
}

export function addTempBotMessage(text, isLoading) {
  const ts = new Date().toISOString();
  const row = document.createElement("div");
  row.className = "row bot";
  const wrap = document.createElement("div");
  const bubbleStack = document.createElement("div");
  bubbleStack.className = "bubble-stack";
  if (isLoading) {
    bubbleStack.appendChild(createLoadingBubble(true));
  } else {
    fillBotBubbles(bubbleStack, text, true);
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = ts;
  wrap.appendChild(bubbleStack);
  wrap.appendChild(meta);
  row.appendChild(wrap);
  els.chatList.appendChild(row);
  scrollToBottom();
  return { row, bubbleStack, meta, ts };
}



