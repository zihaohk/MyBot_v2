const els = {
  chatList: document.getElementById("chatList"),
  input: document.getElementById("input"),
  btnSend: document.getElementById("btnSend"),
  btnSendText: document.querySelector("#btnSend .btn-text"),
  btnSendSpinner: document.querySelector("#btnSend .spinner"),
  subtitle: document.getElementById("subtitle"),

  btnSettings: document.getElementById("btnSettings"),
  btnPersona: document.getElementById("btnPersona"),
  btnMemory: document.getElementById("btnMemory"),

  modalSettings: document.getElementById("modalSettings"),
  modalPersona: document.getElementById("modalPersona"),
  modalMemory: document.getElementById("modalMemory"),

  memoryTurnsInput: document.getElementById("memoryTurnsInput"),
  btnSaveSettings: document.getElementById("btnSaveSettings"),
  temperatureInput: document.getElementById("temperatureInput"),
  topPInput: document.getElementById("topPInput"),
  sendDelayInput: document.getElementById("sendDelayInput"),
  maxTokensInput: document.getElementById("maxTokensInput"),

  personaEditor: document.getElementById("personaEditor"),
  btnSavePersona: document.getElementById("btnSavePersona"),
  btnReloadPersona: document.getElementById("btnReloadPersona"),

  memoryEditor: document.getElementById("memoryEditor"),
  btnSaveMemory: document.getElementById("btnSaveMemory"),
  btnClearMemory: document.getElementById("btnClearMemory"),
  btnReloadMemory: document.getElementById("btnReloadMemory")
};

let state = {
  config: { memoryTurns: 20, temperature: 0.7, topP: 0.7, sendDelayMs: 3000, maxTokens: 2048 },
  memory: null
};

const DEFAULT_SEND_DELAY_MS = 3000;
let pendingMessages = [];
let batchTimerId = null;
let pendingUserElements = null;
let isGenerating = false;
let countdownTimerId = null;
let countdownRemaining = 0;
let pendingUserTimestamp = null;
let pendingPollId = null;
let pendingPollInFlight = false;

const PENDING_QUEUE_KEY = "emotion-bot:pendingQueue";
const PENDING_POLL_INTERVAL_MS = 1500;

function getSendDelayMs() {
  const n = Number(state.config?.sendDelayMs);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SEND_DELAY_MS;
  return Math.round(n);
}

function getBatchDelaySeconds() {
  const delayMs = getSendDelayMs();
  if (delayMs <= 0) return 0;
  return Math.max(1, Math.ceil(delayMs / 1000));
}

function buildBatchCountdownText(seconds) {
  return `\u5c06\u5728${seconds}\u79d2\u540e\u53d1\u9001\uff0c\u53ef\u7ee7\u7eed\u8f93\u5165\u4ee5\u5408\u5e76`;
}

function updateBatchCountdownStatus() {
  setStatus(buildBatchCountdownText(countdownRemaining));
}

function stopBatchCountdown() {
  if (!countdownTimerId) return;
  clearInterval(countdownTimerId);
  countdownTimerId = null;
}

function stopPendingPoll() {
  if (!pendingPollId) return;
  clearInterval(pendingPollId);
  pendingPollId = null;
  pendingPollInFlight = false;
}

async function pollPendingOnce() {
  if (pendingPollInFlight) return;
  pendingPollInFlight = true;
  try {
    const mem = await apiGet("/api/memory");
    state.memory = mem;
    renderMemory(mem);
    const hasPending = mem?.status === "pending";
    if (!hasPending) {
      stopPendingPoll();
      setSendBusy(false);
      setStatus("就绪");
    }
  } catch (err) {
    // keep polling; if server is temporarily unavailable we can retry
  } finally {
    pendingPollInFlight = false;
  }
}

function startPendingPoll() {
  if (pendingPollId) return;
  pendingPollId = setInterval(() => {
    pollPendingOnce().catch(() => {});
  }, PENDING_POLL_INTERVAL_MS);
}

function startBatchCountdown(overrideSeconds) {
  stopBatchCountdown();
  const seconds = Number.isFinite(overrideSeconds)
    ? Math.max(0, Math.ceil(overrideSeconds))
    : getBatchDelaySeconds();
  if (seconds <= 0) return;
  countdownRemaining = seconds;
  updateBatchCountdownStatus();
  countdownTimerId = setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      stopBatchCountdown();
      return;
    }
    updateBatchCountdownStatus();
  }, 1000);
}

function setStatus(message) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  els.subtitle.textContent = text;
}

function setSendBusy(busy) {
  isGenerating = busy;
  els.btnSend.disabled = busy;
  els.btnSend.classList.toggle("is-loading", busy);
  if (els.btnSendSpinner) {
    els.btnSendSpinner.classList.toggle("hidden", !busy);
  }
}

function getNumberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function scrollToBottom() {
  els.chatList.scrollTop = els.chatList.scrollHeight;
}

function splitMessageLines(text) {
  return String(text).split("$").filter(line => line.length > 0);
}

function fillUserBubbles(container, text) {
  container.innerHTML = "";
  const lines = splitMessageLines(text);
  const safeLines = lines.length > 0 ? lines : [""];
  for (const line of safeLines) {
    const bubble = document.createElement("div");
    bubble.className = "bubble user";
    bubble.textContent = line;
    container.appendChild(bubble);
  }
}

function fillBotBubbles(container, text) {
  container.innerHTML = "";
  const lines = splitMessageLines(text);
  const safeLines = lines.length > 0 ? lines : [""];
  for (const line of safeLines) {
    const bubble = document.createElement("div");
    bubble.className = "bubble bot";
    bubble.textContent = line;
    container.appendChild(bubble);
  }
}

function createLoadingBubble() {
  const bubble = document.createElement("div");
  bubble.className = "bubble bot loading";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    bubble.appendChild(dot);
  }
  return bubble;
}

function renderTurn(turn, assistantOverride, isLoading) {
  const assistantText = typeof assistantOverride === "string" ? assistantOverride : turn.assistant;
  const userRow = document.createElement("div");
  userRow.className = "row user";
  const userWrap = document.createElement("div");
  const userBubbleStack = document.createElement("div");
  userBubbleStack.className = "bubble-stack";
  fillUserBubbles(userBubbleStack, turn.user);
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
    botBubbleStack.appendChild(createLoadingBubble());
  } else {
    fillBotBubbles(botBubbleStack, assistantText);
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

function renderMemory(memory) {
  els.chatList.innerHTML = "";
  const turns = Array.isArray(memory?.turns) ? memory.turns : [];
  const hasPending = memory?.status === "pending";
  const lastIdx = turns.length - 1;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const isLoading = hasPending && i === lastIdx;
    renderTurn(t, undefined, isLoading);
  }
  scrollToBottom();
}

function addTempUserMessage(text, tsOverride) {
  const ts = typeof tsOverride === "string" ? tsOverride : new Date().toISOString();
  const row = document.createElement("div");
  row.className = "row user";
  const wrap = document.createElement("div");
  const bubbleStack = document.createElement("div");
  bubbleStack.className = "bubble-stack";
  fillUserBubbles(bubbleStack, text);
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

function addTempBotMessage(text, isLoading) {
  const ts = new Date().toISOString();
  const row = document.createElement("div");
  row.className = "row bot";
  const wrap = document.createElement("div");
  const bubbleStack = document.createElement("div");
  bubbleStack.className = "bubble-stack";
  if (isLoading) {
    bubbleStack.appendChild(createLoadingBubble());
  } else {
    fillBotBubbles(bubbleStack, text);
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

function showModal(modalEl) {
  modalEl.classList.remove("hidden");
}

function hideModal(modalEl) {
  modalEl.classList.add("hidden");
}

function loadPendingQueue() {
  const raw = localStorage.getItem(PENDING_QUEUE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const messages = Array.isArray(data?.messages) ? data.messages.filter(m => typeof m === "string") : [];
    if (messages.length === 0) return null;
    const sendAt = Number(data?.sendAt);
    const ts = typeof data?.ts === "string" ? data.ts : null;
    return { messages, sendAt, ts };
  } catch {
    return null;
  }
}

function savePendingQueue(sendAt) {
  if (!pendingMessages.length) {
    localStorage.removeItem(PENDING_QUEUE_KEY);
    return;
  }
  const payload = {
    messages: pendingMessages.slice(),
    sendAt: Number.isFinite(sendAt) ? sendAt : Date.now(),
    ts: pendingUserTimestamp || new Date().toISOString()
  };
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(payload));
}

function clearPendingQueue() {
  localStorage.removeItem(PENDING_QUEUE_KEY);
}

function scheduleBatchSendWithDelay(delayMs) {
  if (batchTimerId) {
    clearTimeout(batchTimerId);
  }
  if (delayMs <= 0) {
    batchTimerId = null;
    stopBatchCountdown();
    flushPendingMessages().catch(err => setStatus(`发送失败：${err.message}`));
    return;
  }
  startBatchCountdown(Math.ceil(delayMs / 1000));
  batchTimerId = setTimeout(() => {
    batchTimerId = null;
    stopBatchCountdown();
    flushPendingMessages().catch(err => setStatus(`发送失败：${err.message}`));
  }, delayMs);
}

function restorePendingQueue() {
  const stored = loadPendingQueue();
  if (!stored || isGenerating) return false;

  pendingMessages = stored.messages.slice();
  const combinedText = pendingMessages.join("$");
  pendingUserTimestamp = stored.ts || new Date().toISOString();
  pendingUserElements = addTempUserMessage(combinedText, pendingUserTimestamp);

  const remainingMs = Number.isFinite(stored.sendAt)
    ? Math.max(0, stored.sendAt - Date.now())
    : getSendDelayMs();
  scheduleBatchSendWithDelay(remainingMs);
  return true;
}

async function apiGet(url) {
  const resp = await fetch(url);
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `GET ${url} failed`);
  return json;
}

async function apiPut(url, body) {
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `PUT ${url} failed`);
  return json;
}

async function apiPost(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `POST ${url} failed`);
  return json;
}

async function loadAll() {
  const cfg = await apiGet("/api/config");
  state.config = cfg;

  const mem = await apiGet("/api/memory");
  state.memory = mem;
  renderMemory(mem);

  const hasPending = mem?.status === "pending";
  if (hasPending) {
    clearPendingQueue();
    setSendBusy(true);
    setStatus("对方输入中...");
    startPendingPoll();
    return;
  }
  const restored = restorePendingQueue();
  if (!restored) {
    setStatus("就绪");
  }
}

async function openSettings() {
  els.memoryTurnsInput.value = getNumberOrDefault(state.config.memoryTurns, 20);
  els.temperatureInput.value = getNumberOrDefault(state.config.temperature, 0.7);
  els.topPInput.value = getNumberOrDefault(state.config.topP, 0.7);
  els.sendDelayInput.value = getNumberOrDefault(state.config.sendDelayMs, DEFAULT_SEND_DELAY_MS);
  els.maxTokensInput.value = getNumberOrDefault(state.config.maxTokens, 2048);
  showModal(els.modalSettings);
}

async function saveSettings() {
  const n = Number(els.memoryTurnsInput.value);
  const temperature = Number(els.temperatureInput.value);
  const topP = Number(els.topPInput.value);
  const sendDelayMs = Number(els.sendDelayInput.value);
  const maxTokens = Number(els.maxTokensInput.value);
  const updated = await apiPut("/api/config", { memoryTurns: n, temperature, topP, sendDelayMs, maxTokens });
  state.config = updated;

  // reload memory (server trimmed)
  const mem = await apiGet("/api/memory");
  state.memory = mem;
  renderMemory(mem);

  hideModal(els.modalSettings);
  setStatus("设置已保存");
}

async function openPersona() {
  const { content } = await apiGet("/api/persona");
  els.personaEditor.value = content;
  showModal(els.modalPersona);
}

async function reloadPersona() {
  const { content } = await apiGet("/api/persona");
  els.personaEditor.value = content;
  setStatus("人设已重新加载");
}

async function savePersona() {
  await apiPut("/api/persona", { content: els.personaEditor.value });
  hideModal(els.modalPersona);
  setStatus("人设已保存");
}

async function openMemory() {
  const mem = await apiGet("/api/memory");
  state.memory = mem;
  els.memoryEditor.value = JSON.stringify(mem, null, 2);
  showModal(els.modalMemory);
}

async function reloadMemory() {
  const mem = await apiGet("/api/memory");
  state.memory = mem;
  els.memoryEditor.value = JSON.stringify(mem, null, 2);
  setStatus("记忆已重新加载");
}

async function saveMemory() {
  let parsed;
  try {
    parsed = JSON.parse(els.memoryEditor.value);
  } catch {
    setStatus("记忆 JSON 解析失败：请确认是合法 JSON。");
    return;
  }

  await apiPut("/api/memory", parsed);

  // after saving, server may not trim automatically here,
  // so we also re-apply config trimming by reloading config+memory
  const cfg = await apiGet("/api/config");
  state.config = cfg;

  const mem = await apiGet("/api/memory");
  state.memory = mem;
  renderMemory(mem);

  hideModal(els.modalMemory);
  setStatus("记忆已保存");
}

async function clearMemory() {
  const ok = confirm("确认清空记忆？此操作不可撤销。");
  if (!ok) return;

  await apiPut("/api/memory", { turns: [] });

  const cfg = await apiGet("/api/config");
  state.config = cfg;

  const mem = await apiGet("/api/memory");
  state.memory = mem;
  renderMemory(mem);

  hideModal(els.modalMemory);
  setStatus("记忆已清空");
}

function queueMessage(text) {
  if (isGenerating) {
    setStatus("生成中，暂不可发送");
    return;
  }

  pendingMessages.push(text);
  const combinedText = pendingMessages.join("$");

  if (!pendingUserElements) {
    pendingUserTimestamp = new Date().toISOString();
    pendingUserElements = addTempUserMessage(combinedText, pendingUserTimestamp);
  } else {
    fillUserBubbles(pendingUserElements.bubbleStack, combinedText);
    pendingUserTimestamp = new Date().toISOString();
    pendingUserElements.meta.textContent = pendingUserTimestamp;
    scrollToBottom();
  }

  scheduleBatchSend();
}

function scheduleBatchSend() {
  const delayMs = getSendDelayMs();
  const sendAt = Date.now() + Math.max(0, delayMs);
  savePendingQueue(sendAt);
  scheduleBatchSendWithDelay(delayMs);
}

async function flushPendingMessages() {
  if (isGenerating || pendingMessages.length === 0) return;
  stopBatchCountdown();
  const combinedText = pendingMessages.join("$");
  const pendingDisplay = pendingUserElements;
  pendingMessages = [];
  pendingUserElements = null;
  pendingUserTimestamp = null;

  setSendBusy(true);
  setStatus("对方输入中...");
  const botPlaceholder = addTempBotMessage("", true);

  try {
    const result = await apiPost("/api/chat", { userMessage: combinedText });

    if (botPlaceholder?.bubbleStack) {
      fillBotBubbles(botPlaceholder.bubbleStack, result.assistantMessage || "");
    }

    const mem = await apiGet("/api/memory");
    state.memory = mem;
    renderMemory(mem);

    setStatus("就绪");
    clearPendingQueue();
  } catch (e) {
    if (botPlaceholder?.row) botPlaceholder.row.remove();
    if (pendingDisplay?.row) pendingDisplay.row.remove();
    setStatus(`请求失败：${e.message}`);
    clearPendingQueue();
    els.input.value = combinedText;
    try {
      const mem = await apiGet("/api/memory");
      state.memory = mem;
      renderMemory(mem);
    } catch {
      // ignore refresh errors
    }
  } finally {
    setSendBusy(false);
    els.input.focus();
  }
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;

  if (isGenerating) {
    setStatus("生成中，暂不可发送");
    return;
  }

  els.input.value = "";
  queueMessage(text);
}

// Close modal on overlay click or close button
document.addEventListener("click", (ev) => {
  const closeId = ev.target?.getAttribute?.("data-close");
  if (closeId) {
    const modal = document.getElementById(closeId);
    if (modal) hideModal(modal);
    return;
  }
  if (ev.target === els.modalSettings) hideModal(els.modalSettings);
  if (ev.target === els.modalPersona) hideModal(els.modalPersona);
  if (ev.target === els.modalMemory) hideModal(els.modalMemory);
});

// Bind UI events
els.btnSettings.addEventListener("click", openSettings);
els.btnSaveSettings.addEventListener("click", () => saveSettings().catch(err => setStatus(`设置失败：${err.message}`)));

els.btnPersona.addEventListener("click", () => openPersona().catch(err => setStatus(`加载人设失败：${err.message}`)));
els.btnReloadPersona.addEventListener("click", () => reloadPersona().catch(err => setStatus(`重新加载人设失败：${err.message}`)));
els.btnSavePersona.addEventListener("click", () => savePersona().catch(err => setStatus(`保存人设失败：${err.message}`)));

els.btnMemory.addEventListener("click", () => openMemory().catch(err => setStatus(`加载记忆失败：${err.message}`)));
els.btnReloadMemory.addEventListener("click", () => reloadMemory().catch(err => setStatus(`重新加载记忆失败：${err.message}`)));
els.btnSaveMemory.addEventListener("click", () => saveMemory().catch(err => setStatus(`保存记忆失败：${err.message}`)));
els.btnClearMemory.addEventListener("click", () => clearMemory().catch(err => setStatus(`清空记忆失败：${err.message}`)));

els.btnSend.addEventListener("click", () => sendMessage().catch(err => setStatus(`发送失败：${err.message}`)));

els.input.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    sendMessage().catch(err => setStatus(`发送失败：${err.message}`));
  }
});

// Initial load
loadAll().catch(err => {
  setStatus(`初始化失败：${err.message}`);
});
