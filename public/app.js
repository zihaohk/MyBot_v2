const els = {
  chatList: document.getElementById("chatList"),
  input: document.getElementById("input"),
  btnSend: document.getElementById("btnSend"),
  btnSendText: document.querySelector("#btnSend .btn-text"),
  btnSendSpinner: document.querySelector("#btnSend .spinner"),
  subtitle: document.getElementById("subtitle"),
  title: document.querySelector(".topbar-title .title"),

  btnSettings: document.getElementById("btnSettings"),
  btnPersona: document.getElementById("btnPersona"),
  btnMemory: document.getElementById("btnMemory"),

  modalSettings: document.getElementById("modalSettings"),
  modalPersona: document.getElementById("modalPersona"),
  modalMemory: document.getElementById("modalMemory"),
  modalCreatePersona: document.getElementById("modalCreatePersona"),

  memoryTurnsInput: document.getElementById("memoryTurnsInput"),
  btnSaveSettings: document.getElementById("btnSaveSettings"),
  temperatureInput: document.getElementById("temperatureInput"),
  topPInput: document.getElementById("topPInput"),
  sendDelayInput: document.getElementById("sendDelayInput"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  assistantSegmentDelayInput: document.getElementById("assistantSegmentDelayInput"),
  fontFamilySelect: document.getElementById("fontFamilySelect"),

  personaEditor: document.getElementById("personaEditor"),
  btnSavePersona: document.getElementById("btnSavePersona"),
  btnReloadPersona: document.getElementById("btnReloadPersona"),

  memoryEditor: document.getElementById("memoryEditor"),
  btnSaveMemory: document.getElementById("btnSaveMemory"),
  btnClearMemory: document.getElementById("btnClearMemory"),
  btnReloadMemory: document.getElementById("btnReloadMemory"),

  personaList: document.getElementById("personaList"),
  btnNewPersona: document.getElementById("btnNewPersona"),
  btnDeletePersona: document.getElementById("btnDeletePersona"),
  personaIdInput: document.getElementById("personaIdInput"),
  personaNameInput: document.getElementById("personaNameInput"),
  personaCreateError: document.getElementById("personaCreateError"),
  btnCreatePersona: document.getElementById("btnCreatePersona"),
  emptyState: document.getElementById("emptyState"),
  composer: document.getElementById("composer"),
  personaToggle: document.getElementById("personaToggle")
};

let state = {
  config: {
    memoryTurns: 20,
    temperature: 0.7,
    topP: 0.7,
    sendDelayMs: 3000,
    maxTokens: 2048,
    assistantSegmentDelayMs: 800,
    fontFamily: "system"
  },
  personas: [],
  activePersonaId: null
};

const DEFAULT_SEND_DELAY_MS = 3000;
const personaStates = new Map();
let draggingPersonaId = null;

const PENDING_QUEUE_KEY_PREFIX = "emotion-bot:pendingQueue:";
const ACTIVE_PERSONA_KEY = "emotion-bot:activePersona";
const PANEL_STATE_KEY = "emotion-bot:panelCollapsed";
const ACTIVE_PERSONA_NAME_KEY = "emotion-bot:activePersonaName";
const UI_FONT_VALUE_KEY = "emotion-bot:uiFontValue";
const PENDING_POLL_INTERVAL_MS = 1500;
const UNDO_WINDOW_MS = 3000;
const PERSONA_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const defaultTitleText = els.title ? els.title.textContent : "";
const defaultSubtitleText = els.subtitle ? els.subtitle.textContent : "";
const PANEL_COLLAPSED_CLASS = "panel-collapsed";
const APP_READY_CLASS = "app-ready";
const NO_PANEL_ANIM_CLASS = "no-panel-anim";
const FONT_FAMILY_MAP = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  yahei: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  noto: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  song: '"SimSun", "STSong", serif',
  kaiti: '"KaiTi", "STKaiti", serif',
  fangsong: '"FangSong", "STFangsong", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
};
const personaNameCollator = (() => {
  try {
    return new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "base", numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
})();

function applyFontFamily(fontKey, options = {}) {
  const key = typeof fontKey === "string" ? fontKey : "system";
  const font = FONT_FAMILY_MAP[key] || FONT_FAMILY_MAP.system;
  document.documentElement.style.setProperty("--uiFont", font);
  if (options.persist !== false) {
    writeSessionValue(UI_FONT_VALUE_KEY, font);
  }
}

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore session storage errors
  }
}

function clearSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore session storage errors
  }
}

function applySessionSnapshot() {
  const storedFont = readSessionValue(UI_FONT_VALUE_KEY);
  if (storedFont) {
    document.documentElement.style.setProperty("--uiFont", storedFont);
  }
  const storedName = readSessionValue(ACTIVE_PERSONA_NAME_KEY);
  if (storedName && els.title) {
    els.title.textContent = storedName;
  }
  const storedPanel = getStoredPanelCollapsed();
  if (storedPanel === true) {
    document.body.classList.add(PANEL_COLLAPSED_CLASS);
  } else if (storedPanel === false) {
    document.body.classList.remove(PANEL_COLLAPSED_CLASS);
  }
}

function ensureSidebarLayout() {
  const mainEl = document.querySelector(".main");
  const chatEl = document.querySelector(".chat");
  const composerEl = els.composer;
  const topbarEl = document.querySelector(".topbar");
  if (!mainEl || !chatEl || !composerEl || !topbarEl) return;

  let chatColumn = mainEl.querySelector(".chat-column");
  if (!chatColumn) {
    chatColumn = document.createElement("div");
    chatColumn.className = "chat-column";
    const personaPanel = mainEl.querySelector(".persona-panel");
    mainEl.insertBefore(chatColumn, personaPanel || chatEl);
  }

  if (chatEl.parentElement !== chatColumn) {
    chatColumn.appendChild(chatEl);
  }
  if (composerEl.parentElement !== chatColumn) {
    chatColumn.appendChild(composerEl);
  }

  let leftColumn = mainEl.querySelector(".left-column");
  if (!leftColumn) {
    leftColumn = document.createElement("div");
    leftColumn.className = "left-column";
    mainEl.insertBefore(leftColumn, chatColumn);
  }

  if (topbarEl.parentElement !== leftColumn) {
    leftColumn.appendChild(topbarEl);
  }
  if (chatColumn.parentElement !== leftColumn) {
    leftColumn.appendChild(chatColumn);
  }
}

ensureSidebarLayout();
document.body.classList.add(NO_PANEL_ANIM_CLASS);
applySessionSnapshot();

function setPersonaPanelCollapsed(collapsed, options = {}) {
  const persist = options.persist !== false;
  document.body.classList.toggle(PANEL_COLLAPSED_CLASS, collapsed);
  if (persist) {
    writeSessionValue(PANEL_STATE_KEY, collapsed ? "1" : "0");
  }
  if (!els.personaToggle) return;
  els.personaToggle.textContent = collapsed ? "<" : ">";
  els.personaToggle.setAttribute(
    "aria-label",
    collapsed ? "Expand persona panel" : "Collapse persona panel"
  );
}

function getStoredPanelCollapsed() {
  const stored = readSessionValue(PANEL_STATE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return null;
}

if (els.personaToggle) {
  els.personaToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.contains(PANEL_COLLAPSED_CLASS);
    setPersonaPanelCollapsed(!collapsed);
  });
}
const storedPanel = getStoredPanelCollapsed();
if (storedPanel === null) {
  setPersonaPanelCollapsed(true, { persist: true });
} else {
  setPersonaPanelCollapsed(storedPanel, { persist: false });
}
document.body.classList.add(APP_READY_CLASS);
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.remove(NO_PANEL_ANIM_CLASS);
  });
});

function getPendingQueueKey(personaId) {
  return `${PENDING_QUEUE_KEY_PREFIX}${personaId}`;
}

function getPersonaState(personaId) {
  if (!personaStates.has(personaId)) {
    personaStates.set(personaId, {
      memory: null,
      draft: "",
      pendingMessages: [],
      batchTimerId: null,
      pendingUserElements: null,
      isGenerating: false,
      statusMessage: "",
      assistantSegmentTimers: [],
      animateNextAssistant: false,
      countdownTimerId: null,
      countdownRemaining: 0,
      pendingUserTimestamp: null,
      pendingPollId: null,
      pendingPollInFlight: false,
      undoTimerId: null,
      undoText: ""
    });
  }
  return personaStates.get(personaId);
}

function isActivePersona(personaId) {
  return personaId && personaId === state.activePersonaId;
}

function isUndoActive(personaState) {
  return Boolean(personaState?.undoTimerId);
}

function updateSendButtonForActive() {
  if (!state.activePersonaId) return;
  const personaState = getPersonaState(state.activePersonaId);
  const isBusy = personaState.isGenerating || personaState.memory?.status === "pending";
  const undoActive = isUndoActive(personaState) && !isBusy;
  if (els.btnSendText) {
    els.btnSendText.textContent = undoActive ? "撤回" : "发送";
  }
  els.btnSend.classList.toggle("is-undo", undoActive);
}

function clearUndoState(personaId) {
  const personaState = personaStates.get(personaId);
  if (!personaState) return;
  if (personaState.undoTimerId) {
    clearTimeout(personaState.undoTimerId);
  }
  personaState.undoTimerId = null;
  personaState.undoText = "";
  if (isActivePersona(personaId)) {
    updateSendButtonForActive();
  }
}

function startUndoWindow(personaId, text) {
  const personaState = getPersonaState(personaId);
  if (personaState.undoTimerId) {
    clearTimeout(personaState.undoTimerId);
  }
  personaState.undoText = text;
  personaState.undoTimerId = setTimeout(() => {
    personaState.undoTimerId = null;
    personaState.undoText = "";
    if (isActivePersona(personaId)) {
      updateSendButtonForActive();
    }
  }, UNDO_WINDOW_MS);
  if (isActivePersona(personaId)) {
    updateSendButtonForActive();
  }
}

function undoPendingMessage(personaId) {
  const personaState = getPersonaState(personaId);
  if (!personaState.undoText) return false;
  if (!personaState.pendingMessages.length) return false;

  const undoText = personaState.undoText;
  personaState.pendingMessages.pop();

  if (personaState.pendingMessages.length === 0) {
    if (personaState.pendingUserElements?.row) {
      personaState.pendingUserElements.row.remove();
    }
    personaState.pendingUserElements = null;
    personaState.pendingUserTimestamp = null;
    if (personaState.batchTimerId) {
      clearTimeout(personaState.batchTimerId);
      personaState.batchTimerId = null;
    }
    stopBatchCountdown(personaId);
    clearPendingQueue(personaId);
  } else {
    const combinedText = personaState.pendingMessages.join("$");
    if (personaState.pendingUserElements?.bubbleStack) {
      fillUserBubbles(personaState.pendingUserElements.bubbleStack, combinedText);
    } else if (isActivePersona(personaId)) {
      const ts = personaState.pendingUserTimestamp || new Date().toISOString();
      personaState.pendingUserElements = addTempUserMessage(combinedText, ts);
    }
    const stored = loadPendingQueue(personaId);
    savePendingQueue(personaId, stored?.sendAt);
  }

  personaState.draft = undoText;
  if (isActivePersona(personaId)) {
    els.input.value = undoText;
    els.input.focus();
    scrollToBottom();
  }

  clearUndoState(personaId);
  setStatusForPersona(personaId, "已撤回");
  applyStatusForPersona(personaId);
  return true;
}

function setStatusForPersona(personaId, message) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.statusMessage = message;
  if (isActivePersona(personaId)) {
    setStatus(message);
  }
}

function setSendBusyForPersona(personaId, busy) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.isGenerating = busy;
  if (isActivePersona(personaId)) {
    els.btnSend.disabled = busy;
    els.btnSend.classList.toggle("is-loading", busy);
    if (els.btnSendSpinner) {
      els.btnSendSpinner.classList.toggle("hidden", !busy);
    }
    updateSendButtonForActive();
  }
}

function getPersonaById(personaId) {
  return state.personas.find(persona => persona.id === personaId) || null;
}

function hasPersona(personaId) {
  return state.personas.some(persona => persona.id === personaId);
}

function getPersonaDisplayName(personaId) {
  if (!personaId) return defaultTitleText;
  const persona = getPersonaById(personaId);
  return persona?.name || personaId || defaultTitleText;
}

function sortPersonas(list) {
  return list
    .slice()
    .sort((a, b) => personaNameCollator.compare(a?.name || a?.id || "", b?.name || b?.id || ""));
}

function renderPersonaList() {
  els.personaList.innerHTML = "";
  for (const persona of state.personas) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "persona-item";
    item.draggable = true;
    item.dataset.personaId = persona.id;
    if (persona.id === state.activePersonaId) {
      item.classList.add("active");
    }
    item.textContent = persona.name || persona.id;
    item.addEventListener("dblclick", () => {
      const nextId = persona.id === state.activePersonaId ? null : persona.id;
      setActivePersona(nextId).catch(err => setStatus(`Load failed: ${err.message}`));
    });
    item.addEventListener("dragstart", (ev) => {
      draggingPersonaId = persona.id;
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", persona.id);
      }
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      draggingPersonaId = null;
      item.classList.remove("dragging");
      clearPersonaDropIndicator();
    });
    item.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("dragleave", () => {
      // handled by list-level dragover
    });
    els.personaList.appendChild(item);
  }
}

function getPersonaDropIndex(listEl, clientY) {
  const items = Array.from(listEl.querySelectorAll(".persona-item"));
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) return i;
  }
  return items.length;
}

function clearPersonaDropIndicator() {
  const items = els.personaList.querySelectorAll(".persona-item.drop-before, .persona-item.drop-after");
  items.forEach(item => {
    item.classList.remove("drop-before");
    item.classList.remove("drop-after");
  });
}

function updatePersonaDropIndicator(clientY) {
  clearPersonaDropIndicator();
  const items = Array.from(els.personaList.querySelectorAll(".persona-item"));
  if (!items.length) return;
  const index = getPersonaDropIndex(els.personaList, clientY);
  if (index <= 0) {
    items[0].classList.add("drop-before");
    return;
  }
  if (index >= items.length) {
    items[items.length - 1].classList.add("drop-after");
    return;
  }
  items[index].classList.add("drop-before");
}

function movePersonaToIndex(sourceId, targetIndex) {
  const list = state.personas.slice();
  const fromIndex = list.findIndex(persona => persona.id === sourceId);
  if (fromIndex < 0) return null;
  const [moved] = list.splice(fromIndex, 1);
  let insertIndex = Number.isFinite(targetIndex) ? targetIndex : list.length;
  if (insertIndex > fromIndex) insertIndex -= 1;
  insertIndex = Math.max(0, Math.min(insertIndex, list.length));
  list.splice(insertIndex, 0, moved);
  return list;
}

async function persistPersonaOrder() {
  const order = state.personas.map(persona => persona.id);
  await apiPut("/api/personas/order", { order });
}

function updateTitle() {
  if (!els.title) return;
  const name = getPersonaDisplayName(state.activePersonaId);
  els.title.textContent = name;
  if (state.activePersonaId) {
    writeSessionValue(ACTIVE_PERSONA_NAME_KEY, name);
  } else {
    clearSessionValue(ACTIVE_PERSONA_NAME_KEY);
  }
}

function updateComposerVisibility() {
  const hasActive = Boolean(state.activePersonaId);
  const topbarEl = document.querySelector(".topbar");
  const chatEl = document.querySelector(".chat");
  if (topbarEl) {
    topbarEl.classList.toggle("hidden", !hasActive);
  }
  if (chatEl) {
    chatEl.classList.toggle("is-empty", !hasActive);
  }
  els.composer.classList.toggle("hidden", !hasActive);
  els.emptyState.classList.toggle("hidden", hasActive);
  if (!hasActive) {
    els.chatList.innerHTML = "";
  }
}

function applyStatusForPersona(personaId) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (personaState.countdownTimerId && personaState.countdownRemaining > 0) {
    updateBatchCountdownStatus(personaId);
    return;
  }
  if (personaState.isGenerating) {
    setStatusForPersona(personaId, "对方输入中...");
    return;
  }
  if (personaState.statusMessage) {
    setStatusForPersona(personaId, personaState.statusMessage);
    return;
  }
  setStatusForPersona(personaId, defaultSubtitleText || "就绪");
}

function renderPendingQueueForActive(personaId) {
  if (!isActivePersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (!personaState.pendingMessages.length || personaState.pendingUserElements) return;
  const combinedText = personaState.pendingMessages.join("$");
  const ts = personaState.pendingUserTimestamp || new Date().toISOString();
  personaState.pendingUserTimestamp = ts;
  personaState.pendingUserElements = addTempUserMessage(combinedText, ts);
  if (personaState.countdownRemaining > 0) {
    updateBatchCountdownStatus(personaId);
  }
}

async function loadPersonas() {
  const resp = await apiGet("/api/personas");
  const personas = Array.isArray(resp?.personas) ? resp.personas : [];
  state.personas = personas;
  renderPersonaList();
  return state.personas;
}

function pickInitialPersonaId() {
  const stored = readSessionValue(ACTIVE_PERSONA_KEY);
  if (stored && state.personas.some(persona => persona.id === stored)) {
    return stored;
  }
  return state.personas.length ? state.personas[0].id : null;
}

async function setActivePersona(personaId, options = {}) {
  const nextId = personaId && hasPersona(personaId) ? personaId : null;
  if (nextId === state.activePersonaId && !options.forceReload) {
    return;
  }

  const prevId = state.activePersonaId;
  if (prevId) {
    const prevState = getPersonaState(prevId);
    prevState.draft = els.input.value;
    prevState.pendingUserElements = null;
    stopPendingPoll(prevId);
    clearAssistantSegmentTimers(prevId);
  }

  state.activePersonaId = nextId;
  if (state.activePersonaId) {
    writeSessionValue(ACTIVE_PERSONA_KEY, state.activePersonaId);
  } else {
    clearSessionValue(ACTIVE_PERSONA_KEY);
  }

  updateComposerVisibility();
  updateTitle();
  renderPersonaList();

  if (!state.activePersonaId) {
    setStatus(defaultSubtitleText || "就绪");
    return;
  }

  const personaState = getPersonaState(state.activePersonaId);
  els.input.value = personaState.draft || "";

  const shouldReload =
    !personaState.memory ||
    options.forceReload ||
    personaState.isGenerating ||
    personaState.memory?.status === "pending";
  if (shouldReload) {
    await loadPersonaMemory(state.activePersonaId);
  } else {
    renderMemory(personaState.memory);
  }

  renderPendingQueueForActive(state.activePersonaId);
  applyStatusForPersona(state.activePersonaId);
  setSendBusyForPersona(state.activePersonaId, personaState.isGenerating);
  if (personaState.memory?.status === "pending") {
    startPendingPoll(state.activePersonaId);
  }
}

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

function getAssistantSegmentDelayMs() {
  const n = Number(state.config?.assistantSegmentDelayMs);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function buildBatchCountdownText(seconds) {
  return `将在${seconds}秒后发送，可继续输入以合并`;
}

function updateBatchCountdownStatus(personaId) {
  const personaState = getPersonaState(personaId);
  setStatusForPersona(personaId, buildBatchCountdownText(personaState.countdownRemaining));
}

function stopBatchCountdown(personaId) {
  const personaState = personaStates.get(personaId);
  if (!personaState) return;
  if (!personaState.countdownTimerId) return;
  clearInterval(personaState.countdownTimerId);
  personaState.countdownTimerId = null;
}

function stopPendingPoll(personaId) {
  const personaState = personaStates.get(personaId);
  if (!personaState) return;
  if (!personaState.pendingPollId) return;
  clearInterval(personaState.pendingPollId);
  personaState.pendingPollId = null;
  personaState.pendingPollInFlight = false;
}

async function pollPendingOnce(personaId) {
  if (!hasPersona(personaId)) {
    stopPendingPoll(personaId);
    return;
  }
  const personaState = getPersonaState(personaId);
  if (personaState.pendingPollInFlight) return;
  personaState.pendingPollInFlight = true;
  try {
    const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(personaId)}`);
    if (!hasPersona(personaId)) return;
    personaState.memory = mem;
    renderActiveMemory(personaId, mem);
    const hasPending = mem?.status === "pending";
    if (!hasPending) {
      stopPendingPoll(personaId);
      setSendBusyForPersona(personaId, false);
      setStatusForPersona(personaId, "就绪");
    }
  } catch (err) {
    // keep polling; if server is temporarily unavailable we can retry
  } finally {
    personaState.pendingPollInFlight = false;
  }
}

function startPendingPoll(personaId) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (personaState.pendingPollId) return;
  personaState.pendingPollId = setInterval(() => {
    pollPendingOnce(personaId).catch(() => {});
  }, PENDING_POLL_INTERVAL_MS);
}

function startBatchCountdown(personaId, overrideSeconds) {
  stopBatchCountdown(personaId);
  const seconds = Number.isFinite(overrideSeconds)
    ? Math.max(0, Math.ceil(overrideSeconds))
    : getBatchDelaySeconds();
  if (seconds <= 0) return;
  const personaState = getPersonaState(personaId);
  personaState.countdownRemaining = seconds;
  updateBatchCountdownStatus(personaId);
  personaState.countdownTimerId = setInterval(() => {
    personaState.countdownRemaining -= 1;
    if (personaState.countdownRemaining <= 0) {
      stopBatchCountdown(personaId);
      return;
    }
    updateBatchCountdownStatus(personaId);
  }, 1000);
}

function setStatus(message) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  els.subtitle.textContent = text;
}

function setSendBusy(busy) {
  if (!state.activePersonaId) return;
  setSendBusyForPersona(state.activePersonaId, busy);
}

function getNumberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scrollToBottom() {
  els.chatList.scrollTo({
    top: els.chatList.scrollHeight,
    behavior: "smooth"
  });
}

function splitMessageLines(text) {
  return String(text).split("$").filter(line => line.length > 0);
}

function fillUserBubbles(container, text, animate = false) {
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

function fillBotBubbles(container, text, animate = false) {
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

function renderAssistantSegments(container, text, personaId, onDone) {
  const delayMs = getAssistantSegmentDelayMs();
  const segments = splitMessageLines(text);
  if (segments.length === 0 || delayMs <= 0 || segments.length === 1) {
    fillBotBubbles(container, text, true);
    scrollToBottom();
    if (typeof onDone === "function") onDone();
    return false;
  }
  container.innerHTML = "";
  const personaState = getPersonaState(personaId);
  clearAssistantSegmentTimers(personaId);
  let index = 0;
  const pushNext = () => {
    if (!hasPersona(personaId) || !isActivePersona(personaId)) {
      clearAssistantSegmentTimers(personaId);
      return;
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble bot pop";
    bubble.textContent = segments[index];
    container.appendChild(bubble);
    scrollToBottom();
    index += 1;
    if (index >= segments.length) {
      personaState.assistantSegmentTimers = [];
      if (typeof onDone === "function") onDone();
      return;
    }
    const timerId = setTimeout(pushNext, delayMs);
    personaState.assistantSegmentTimers.push(timerId);
  };
  pushNext();
  return true;
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

function renderTurn(turn, assistantOverride, isLoading, animateAssistant) {
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

function renderMemory(memory, options = {}) {
  els.chatList.innerHTML = "";
  const turns = Array.isArray(memory?.turns) ? memory.turns : [];
  const hasPending = memory?.status === "pending";
  const animateLastAssistant = Boolean(options.animateLastAssistant);
  const lastIdx = turns.length - 1;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const isLoading = hasPending && i === lastIdx;
    const animateAssistant = animateLastAssistant && i === lastIdx && !isLoading;
    renderTurn(t, undefined, isLoading, animateAssistant);
  }
  scrollToBottom();
}

function renderActiveMemory(personaId, memory) {
  if (!isActivePersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.pendingUserElements = null;
  clearAssistantSegmentTimers(personaId);
  renderMemory(memory, { animateLastAssistant: personaState.animateNextAssistant });
  personaState.animateNextAssistant = false;
  renderPendingQueueForActive(personaId);
}

function addTempUserMessage(text, tsOverride) {
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

function showModal(modalEl) {
  modalEl.classList.remove("hidden");
}

function hideModal(modalEl) {
  modalEl.classList.add("hidden");
}

function loadPendingQueue(personaId) {
  let raw = null;
  try {
    raw = localStorage.getItem(getPendingQueueKey(personaId));
  } catch {
    return null;
  }
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

function savePendingQueue(personaId, sendAt) {
  const personaState = getPersonaState(personaId);
  if (!personaState.pendingMessages.length) {
    try {
      localStorage.removeItem(getPendingQueueKey(personaId));
    } catch {
      // ignore storage errors
    }
    return;
  }
  const payload = {
    messages: personaState.pendingMessages.slice(),
    sendAt: Number.isFinite(sendAt) ? sendAt : Date.now(),
    ts: personaState.pendingUserTimestamp || new Date().toISOString()
  };
  try {
    localStorage.setItem(getPendingQueueKey(personaId), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function clearPendingQueue(personaId) {
  try {
    localStorage.removeItem(getPendingQueueKey(personaId));
  } catch {
    // ignore storage errors
  }
}

function scheduleBatchSendWithDelay(personaId, delayMs) {
  const personaState = getPersonaState(personaId);
  if (personaState.batchTimerId) {
    clearTimeout(personaState.batchTimerId);
  }
  if (delayMs <= 0) {
    personaState.batchTimerId = null;
    stopBatchCountdown(personaId);
    flushPendingMessages(personaId).catch(err => setStatusForPersona(personaId, `发送失败：${err.message}`));
    return;
  }
  startBatchCountdown(personaId, Math.ceil(delayMs / 1000));
  personaState.batchTimerId = setTimeout(() => {
    personaState.batchTimerId = null;
    stopBatchCountdown(personaId);
    flushPendingMessages(personaId).catch(err => setStatusForPersona(personaId, `发送失败：${err.message}`));
  }, delayMs);
}

function restorePendingQueue(personaId, render) {
  const personaState = getPersonaState(personaId);
  const stored = loadPendingQueue(personaId);
  if (!stored || personaState.isGenerating) return false;

  personaState.pendingMessages = stored.messages.slice();
  const combinedText = personaState.pendingMessages.join("$");
  personaState.pendingUserTimestamp = stored.ts || new Date().toISOString();

  if (render) {
    personaState.pendingUserElements = addTempUserMessage(combinedText, personaState.pendingUserTimestamp);
  }

  const remainingMs = Number.isFinite(stored.sendAt)
    ? Math.max(0, stored.sendAt - Date.now())
    : getSendDelayMs();
  scheduleBatchSendWithDelay(personaId, remainingMs);
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

async function apiDelete(url) {
  const resp = await fetch(url, { method: "DELETE" });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `DELETE ${url} failed`);
  return json;
}

async function loadPersonaMemory(personaId) {
  const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(personaId)}`);
  const personaState = getPersonaState(personaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
  if (personaState.isGenerating) {
    personaState.pendingMessages = [];
    personaState.pendingUserElements = null;
    personaState.pendingUserTimestamp = null;
    clearPendingQueue(personaId);
  }

  renderActiveMemory(personaId, mem);

  return mem;
}

async function loadAll() {
  const cfg = await apiGet("/api/config");
  state.config = cfg;
  applyFontFamily(state.config.fontFamily);

  await loadPersonas();

  const initialPersonaId = pickInitialPersonaId();
  if (initialPersonaId) {
    await setActivePersona(initialPersonaId, { forceReload: true });
  } else {
    await setActivePersona(null);
  }

  for (const persona of state.personas) {
    restorePendingQueue(persona.id, isActivePersona(persona.id));
  }

  if (state.activePersonaId) {
    const activeState = getPersonaState(state.activePersonaId);
    if (activeState.memory?.status === "pending") {
      setSendBusyForPersona(state.activePersonaId, true);
      setStatusForPersona(state.activePersonaId, "对方输入中...");
      startPendingPoll(state.activePersonaId);
    } else if (!activeState.pendingMessages.length) {
      applyStatusForPersona(state.activePersonaId);
    }
  }
}

async function openSettings() {
  els.memoryTurnsInput.value = getNumberOrDefault(state.config.memoryTurns, 20);
  els.temperatureInput.value = getNumberOrDefault(state.config.temperature, 0.7);
  els.topPInput.value = getNumberOrDefault(state.config.topP, 0.7);
  els.sendDelayInput.value = getNumberOrDefault(state.config.sendDelayMs, DEFAULT_SEND_DELAY_MS);
  els.maxTokensInput.value = getNumberOrDefault(state.config.maxTokens, 2048);
  if (els.assistantSegmentDelayInput) {
    els.assistantSegmentDelayInput.value = getNumberOrDefault(state.config.assistantSegmentDelayMs, 800);
  }
  if (els.fontFamilySelect) {
    els.fontFamilySelect.value = state.config.fontFamily || "system";
  }
  showModal(els.modalSettings);
}

async function saveSettings() {
  const n = Number(els.memoryTurnsInput.value);
  const temperature = Number(els.temperatureInput.value);
  const topP = Number(els.topPInput.value);
  const sendDelayMs = Number(els.sendDelayInput.value);
  const maxTokens = Number(els.maxTokensInput.value);
  const assistantSegmentDelayMs = Number(els.assistantSegmentDelayInput?.value);
  const fontFamily = els.fontFamilySelect?.value;
  const updated = await apiPut("/api/config", {
    memoryTurns: n,
    temperature,
    topP,
    sendDelayMs,
    maxTokens,
    assistantSegmentDelayMs,
    fontFamily
  });
  state.config = updated;
  applyFontFamily(state.config.fontFamily);

  // reload memory (server trimmed)
  if (state.activePersonaId) {
    const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    renderActiveMemory(state.activePersonaId, mem);
  }

  hideModal(els.modalSettings);
  setStatus("设置已保存");
}

async function openPersona() {
  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }
  const { content } = await apiGet(`/api/persona?personaId=${encodeURIComponent(state.activePersonaId)}`);
  els.personaEditor.value = content;
  showModal(els.modalPersona);
}

async function reloadPersona() {
  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }
  const { content } = await apiGet(`/api/persona?personaId=${encodeURIComponent(state.activePersonaId)}`);
  els.personaEditor.value = content;
  await loadPersonas();
  updateTitle();
  setStatus("人设已重新加载");
}

async function savePersona() {
  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }
  await apiPut(`/api/persona?personaId=${encodeURIComponent(state.activePersonaId)}`, { content: els.personaEditor.value });
  await loadPersonas();
  updateTitle();
  hideModal(els.modalPersona);
  setStatus("人设已保存");
}

async function openMemory() {
  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }
  const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`);
  const personaState = getPersonaState(state.activePersonaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
  els.memoryEditor.value = JSON.stringify(mem, null, 2);
  showModal(els.modalMemory);
}

async function reloadMemory() {
  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }
  const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`);
  const personaState = getPersonaState(state.activePersonaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
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

  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }

  await apiPut(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`, parsed);

  // after saving, server may not trim automatically here,
  // so we also re-apply config trimming by reloading config+memory
  const cfg = await apiGet("/api/config");
  state.config = cfg;
  applyFontFamily(state.config.fontFamily);

  const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`);
  const personaState = getPersonaState(state.activePersonaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
  renderActiveMemory(state.activePersonaId, mem);

  hideModal(els.modalMemory);
  setStatus("记忆已保存");
}

async function clearMemory() {
  const ok = confirm("确认清空记忆？此操作不可撤销。");
  if (!ok) return;

  if (!state.activePersonaId) {
    setStatus("Select a persona first.");
    return;
  }

  await apiPut(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`, { turns: [] });

  const cfg = await apiGet("/api/config");
  state.config = cfg;
  applyFontFamily(state.config.fontFamily);

  const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(state.activePersonaId)}`);
  const personaState = getPersonaState(state.activePersonaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
  renderActiveMemory(state.activePersonaId, mem);

  hideModal(els.modalMemory);
  setStatus("记忆已清空");
}

function isValidPersonaId(personaId) {
  return PERSONA_ID_PATTERN.test(personaId);
}

function clearAssistantSegmentTimers(personaId) {
  const personaState = personaStates.get(personaId);
  if (!personaState || !personaState.assistantSegmentTimers?.length) return;
  personaState.assistantSegmentTimers.forEach(id => clearTimeout(id));
  personaState.assistantSegmentTimers = [];
}

function clearPersonaTimers(personaId) {
  const personaState = personaStates.get(personaId);
  if (!personaState) return;
  clearAssistantSegmentTimers(personaId);
  if (personaState.undoTimerId) {
    clearTimeout(personaState.undoTimerId);
    personaState.undoTimerId = null;
    personaState.undoText = "";
  }
  if (personaState.batchTimerId) {
    clearTimeout(personaState.batchTimerId);
    personaState.batchTimerId = null;
  }
  if (personaState.countdownTimerId) {
    clearInterval(personaState.countdownTimerId);
    personaState.countdownTimerId = null;
  }
  if (personaState.pendingPollId) {
    clearInterval(personaState.pendingPollId);
    personaState.pendingPollId = null;
    personaState.pendingPollInFlight = false;
  }
  personaState.pendingMessages = [];
  personaState.pendingUserElements = null;
  personaState.pendingUserTimestamp = null;
}

function openCreatePersonaModal() {
  els.personaIdInput.value = "";
  els.personaNameInput.value = "";
  setCreatePersonaError("");
  showModal(els.modalCreatePersona);
}

function setCreatePersonaError(message) {
  if (!els.personaCreateError) return;
  const text = String(message || "").trim();
  if (!text) {
    els.personaCreateError.textContent = "";
    els.personaCreateError.classList.add("hidden");
    return;
  }
  els.personaCreateError.textContent = text;
  els.personaCreateError.classList.remove("hidden");
}

async function createPersona() {
  const id = String(els.personaIdInput.value || "").trim();
  const name = String(els.personaNameInput.value || "").trim();
  if (!isValidPersonaId(id)) {
    setCreatePersonaError("Invalid folder name.");
    return;
  }
  if (!name) {
    setCreatePersonaError("Persona name is required.");
    return;
  }

  const created = await apiPost("/api/personas", { id, name });
  setCreatePersonaError("");
  hideModal(els.modalCreatePersona);

  await loadPersonas();
  await setActivePersona(created.id, { forceReload: true });
}

async function deleteActivePersona() {
  const personaId = state.activePersonaId;
  if (!personaId) {
    setStatus("Select a persona first.");
    return;
  }
  const ok = confirm("确认删除该人设？此操作不可撤销。");
  if (!ok) return;

  await apiDelete(`/api/personas/${encodeURIComponent(personaId)}`);

  clearPendingQueue(personaId);
  clearPersonaTimers(personaId);
  personaStates.delete(personaId);

  state.personas = state.personas.filter(persona => persona.id !== personaId);
  state.activePersonaId = null;
  clearSessionValue(ACTIVE_PERSONA_KEY);
  updateComposerVisibility();
  updateTitle();
  renderPersonaList();
  setStatus(defaultSubtitleText || "就绪");
}

function queueMessage(personaId, text) {
  const personaState = getPersonaState(personaId);
  if (personaState.isGenerating) {
    setStatusForPersona(personaId, "生成中，暂不可发送");
    return;
  }

  personaState.pendingMessages.push(text);
  const combinedText = personaState.pendingMessages.join("$");
  personaState.pendingUserTimestamp = new Date().toISOString();

  if (isActivePersona(personaId)) {
    if (!personaState.pendingUserElements) {
      personaState.pendingUserElements = addTempUserMessage(combinedText, personaState.pendingUserTimestamp);
    } else {
      fillUserBubbles(personaState.pendingUserElements.bubbleStack, combinedText);
      personaState.pendingUserElements.meta.textContent = personaState.pendingUserTimestamp;
      scrollToBottom();
    }
  }

  scheduleBatchSend(personaId);
  startUndoWindow(personaId, text);
}

function scheduleBatchSend(personaId) {
  const delayMs = getSendDelayMs();
  const sendAt = Date.now() + Math.max(0, delayMs);
  savePendingQueue(personaId, sendAt);
  scheduleBatchSendWithDelay(personaId, delayMs);
}

async function flushPendingMessages(personaId) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (personaState.isGenerating || personaState.pendingMessages.length === 0) return;
  clearUndoState(personaId);
  stopBatchCountdown(personaId);
  const combinedText = personaState.pendingMessages.join("$");
  const pendingDisplay = personaState.pendingUserElements;
  personaState.pendingMessages = [];
  personaState.pendingUserElements = null;
  personaState.pendingUserTimestamp = null;
  clearPendingQueue(personaId);

  setSendBusyForPersona(personaId, true);
  setStatusForPersona(personaId, "对方输入中...");
  const botPlaceholder = isActivePersona(personaId) ? addTempBotMessage("", true) : null;

  let releaseAfterSegments = false;
  let animationDone = false;
  let finalMemory = null;
  try {
    const result = await apiPost("/api/chat", { userMessage: combinedText, personaId });
    if (!hasPersona(personaId)) return;
    personaState.animateNextAssistant = isActivePersona(personaId);

    if (isActivePersona(personaId) && botPlaceholder?.bubbleStack) {
      releaseAfterSegments = renderAssistantSegments(
        botPlaceholder.bubbleStack,
        result.assistantMessage || "",
        personaId,
        () => {
          animationDone = true;
          if (finalMemory && isActivePersona(personaId)) {
            renderActiveMemory(personaId, finalMemory);
          }
          setStatusForPersona(personaId, "就绪");
          setSendBusyForPersona(personaId, false);
          if (isActivePersona(personaId)) {
            els.input.focus();
          }
        }
      );
    }

    const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(personaId)}`);
    personaState.memory = mem;
    if (releaseAfterSegments) {
      finalMemory = mem;
      if (animationDone && isActivePersona(personaId)) {
        renderActiveMemory(personaId, mem);
      }
    } else {
      renderActiveMemory(personaId, mem);
    }

    if (!releaseAfterSegments) {
      setStatusForPersona(personaId, "就绪");
    }
  } catch (e) {
    if (!hasPersona(personaId)) return;
    personaState.animateNextAssistant = false;
    if (botPlaceholder?.row) botPlaceholder.row.remove();
    if (isActivePersona(personaId) && pendingDisplay?.row) pendingDisplay.row.remove();
    setStatusForPersona(personaId, `请求失败：${e.message}`);
    personaState.draft = combinedText;
    if (isActivePersona(personaId)) {
      els.input.value = combinedText;
    }
    try {
      const mem = await apiGet(`/api/memory?personaId=${encodeURIComponent(personaId)}`);
      personaState.memory = mem;
      renderActiveMemory(personaId, mem);
    } catch {
      // ignore refresh errors
    }
  } finally {
    if (!hasPersona(personaId)) return;
    if (!releaseAfterSegments) {
      setSendBusyForPersona(personaId, false);
      if (isActivePersona(personaId)) {
        els.input.focus();
      }
    }
  }
}

async function sendMessage() {
  const personaId = state.activePersonaId;
  if (!personaId) return;
  const personaState = getPersonaState(personaId);
  if (isUndoActive(personaState) && !personaState.isGenerating) {
    if (undoPendingMessage(personaId)) return;
  }
  const text = els.input.value.trim();
  if (!text) return;
  if (personaState.isGenerating) {
    setStatusForPersona(personaId, "生成中，暂不可发送");
    return;
  }

  els.input.value = "";
  personaState.draft = "";
  queueMessage(personaId, text);
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
  if (ev.target === els.modalCreatePersona) hideModal(els.modalCreatePersona);
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

els.btnNewPersona.addEventListener("click", openCreatePersonaModal);
els.btnCreatePersona.addEventListener("click", () => createPersona().catch(err => setCreatePersonaError(`Create failed: ${err.message}`)));
els.btnDeletePersona.addEventListener("click", () => deleteActivePersona().catch(err => setStatus(`Delete failed: ${err.message}`)));

els.personaList.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  updatePersonaDropIndicator(ev.clientY);
});

els.personaList.addEventListener("dragleave", (ev) => {
  if (ev.relatedTarget && els.personaList.contains(ev.relatedTarget)) return;
  clearPersonaDropIndicator();
});

els.personaList.addEventListener("drop", (ev) => {
  const sourceId = draggingPersonaId || ev.dataTransfer?.getData("text/plain");
  clearPersonaDropIndicator();
  if (!sourceId) return;
  const targetIndex = getPersonaDropIndex(els.personaList, ev.clientY);
  const next = movePersonaToIndex(sourceId, targetIndex);
  if (!next) return;
  state.personas = next;
  renderPersonaList();
  persistPersonaOrder().catch(err => {
    setStatus(`Order save failed: ${err.message}`);
    loadPersonas().catch(() => {});
  });
});

els.btnSend.addEventListener("click", () => sendMessage().catch(err => setStatus(`发送失败：${err.message}`)));

els.input.addEventListener("input", () => {
  if (!state.activePersonaId) return;
  const personaState = getPersonaState(state.activePersonaId);
  personaState.draft = els.input.value;
});

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
