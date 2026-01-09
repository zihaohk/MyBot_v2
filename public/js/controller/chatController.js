import { els, defaultSubtitleText } from "../dom.js";
import { state } from "../store/appState.js";
import { getPersonaState, getPersonaStates } from "../store/personaState.js";
import { hasPersona, isActivePersona } from "../store/personaSelectors.js";
import { readLocalValue, writeLocalValue, clearLocalValue } from "../store/storage.js";
import {
  DEFAULT_SEND_DELAY_MS,
  PENDING_QUEUE_KEY_PREFIX,
  PENDING_POLL_INTERVAL_MS
} from "../constants.js";
import {
  addTempBotMessage,
  addTempUserMessage,
  fillBotBubbles,
  fillUserBubbles,
  renderMemory,
  scrollToBottom,
  splitMessageLines
} from "../ui/chatRender.js";
import { setStatusText, updateSendButton } from "../ui/status.js";
import { cancelChat, sendChat } from "../api/chatApi.js";
import { getMemory } from "../api/memoryApi.js";

function getPendingQueueKey(personaId) {
  return `${PENDING_QUEUE_KEY_PREFIX}${personaId}`;
}

function updateSendButtonForActive() {
  if (!state.activePersonaId) return;
  const personaState = getPersonaState(state.activePersonaId);
  const isBusy = personaState.isGenerating || personaState.memory?.status === "pending";
  const canCancel = Boolean(personaState.pendingRequestController) || personaState.memory?.status === "pending";
  const canUndo = !isBusy && personaState.pendingMessages.length > 0;
  updateSendButton({ busy: isBusy, canUndo, canCancel });
}

function getPendingUserText(personaState) {
  if (personaState.pendingSendText) return personaState.pendingSendText;
  if (personaState.memory?.status !== "pending") return "";
  const turns = Array.isArray(personaState.memory?.turns) ? personaState.memory.turns : [];
  const lastTurn = turns[turns.length - 1];
  return typeof lastTurn?.user === "string" ? lastTurn.user : "";
}

function canCancelPending(personaState) {
  return Boolean(personaState.pendingRequestController) || personaState.memory?.status === "pending";
}

function undoPendingMessage(personaId) {
  const personaState = getPersonaState(personaId);
  if (!personaState.pendingMessages.length) return false;

  const undoText = personaState.pendingMessages.pop() || "";

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
    setStatusForPersona(personaId, "已撤回");
    applyStatusForPersona(personaId);
  } else {
    personaState.pendingUserTimestamp = new Date().toISOString();
    const combinedText = personaState.pendingMessages.join("$");
    if (personaState.pendingUserElements?.bubbleStack) {
      fillUserBubbles(personaState.pendingUserElements.bubbleStack, combinedText);
      personaState.pendingUserElements.meta.textContent = personaState.pendingUserTimestamp;
    } else if (isActivePersona(personaId)) {
      personaState.pendingUserElements = addTempUserMessage(combinedText, personaState.pendingUserTimestamp);
    }
    scheduleBatchSend(personaId);
  }

  personaState.draft = undoText;
  if (isActivePersona(personaId)) {
    els.input.value = undoText;
    els.input.focus();
    scrollToBottom();
  }

  updateSendButtonForActive();
  return true;
}

async function cancelPendingResponse(personaId) {
  if (!hasPersona(personaId)) return false;
  const personaState = getPersonaState(personaId);
  if (!canCancelPending(personaState)) return false;

  const pendingText = getPendingUserText(personaState);
  if (personaState.pendingRequestController) {
    personaState.ignorePendingResponse = true;
    personaState.pendingRequestController.abort();
  }

  stopPendingPoll(personaId);

  let cancelResult = null;
  let cancelError = null;
  try {
    cancelResult = await cancelChat(personaId);
  } catch (err) {
    cancelError = err;
  }

  let memory = cancelResult?.memory || null;
  if (!memory) {
    try {
      memory = await getMemory(personaId);
    } catch {
      // ignore refresh errors
    }
  }

  if (memory) {
    personaState.memory = memory;
    if (isActivePersona(personaId)) {
      renderActiveMemory(personaId, memory);
    }
  } else if (isActivePersona(personaId) && personaState.memory) {
    renderActiveMemory(personaId, personaState.memory);
  }

  const cancelled = Boolean(cancelResult?.cancelled);
  const restoredText = pendingText || (typeof cancelResult?.userMessage === "string" ? cancelResult.userMessage : "");

  if (cancelError) {
    setStatusForPersona(personaId, `取消失败：${cancelError.message}`);
    if (memory?.status === "pending") {
      setSendBusyForPersona(personaId, true);
      startPendingPoll(personaId);
      return false;
    }
  } else if (cancelled) {
    if (restoredText && isActivePersona(personaId)) {
      const existing = els.input.value;
      const hasExisting = typeof existing === "string" && existing.trim().length > 0;
      const nextValue = hasExisting ? `${restoredText}\n${existing}` : restoredText;
      els.input.value = nextValue;
      personaState.draft = nextValue;
      els.input.focus();
      scrollToBottom();
    } else if (restoredText) {
      personaState.draft = restoredText;
    }
    setStatusForPersona(personaId, "已取消等待");
  } else {
    setStatusForPersona(personaId, "回复已完成，无法取消");
  }

  setSendBusyForPersona(personaId, false);
  personaState.pendingSendText = "";
  return cancelled;
}

export function setStatusForPersona(personaId, message) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.statusMessage = message;
  if (isActivePersona(personaId)) {
    setStatusText(message);
  }
}

export function setSendBusyForPersona(personaId, busy) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.isGenerating = busy;
  if (isActivePersona(personaId)) {
    updateSendButtonForActive();
  }
}

export function applyStatusForPersona(personaId) {
  const personaState = getPersonaState(personaId);
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

export function renderPendingQueueForActive(personaId) {
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

function shouldRenderMemoryAfterSegments(mem) {
  if (!els.chatList) return true;
  const turns = Array.isArray(mem?.turns) ? mem.turns : [];
  const expectedRows = turns.length * 2;
  return els.chatList.childElementCount !== expectedRows;
}

function syncSegmentedMeta(mem, pendingDisplay, botPlaceholder) {
  const turns = Array.isArray(mem?.turns) ? mem.turns : [];
  const lastTurn = turns[turns.length - 1];
  const lastTs = typeof lastTurn?.ts === "string" ? lastTurn.ts : "";
  if (!lastTs) return;
  if (pendingDisplay?.meta) pendingDisplay.meta.textContent = lastTs;
  if (botPlaceholder?.meta) botPlaceholder.meta.textContent = lastTs;
}

function finalizeSegmentedRender(personaId, mem, pendingDisplay, botPlaceholder) {
  if (!mem || !isActivePersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  personaState.animateNextAssistant = false;
  if (shouldRenderMemoryAfterSegments(mem)) {
    renderActiveMemory(personaId, mem);
    return;
  }
  syncSegmentedMeta(mem, pendingDisplay, botPlaceholder);
}

function isSamePendingMemory(prevMem, nextMem) {
  if (!prevMem || !nextMem) return false;
  if (prevMem.status !== "pending" || nextMem.status !== "pending") return false;
  const prevTurns = Array.isArray(prevMem.turns) ? prevMem.turns : [];
  const nextTurns = Array.isArray(nextMem.turns) ? nextMem.turns : [];
  if (prevTurns.length !== nextTurns.length) return false;
  if (prevTurns.length === 0) return true;
  const prevLast = prevTurns[prevTurns.length - 1] || {};
  const nextLast = nextTurns[nextTurns.length - 1] || {};
  return prevLast.user === nextLast.user &&
    prevLast.assistant === nextLast.assistant &&
    prevLast.ts === nextLast.ts;
}

function hasActiveLoadingBubble() {
  if (!els.chatList) return false;
  const lastRow = els.chatList.lastElementChild;
  if (!lastRow) return false;
  return Boolean(lastRow.querySelector(".bubble.loading"));
}

function getLoadingBubbleStack() {
  if (!els.chatList) return null;
  const botRows = els.chatList.querySelectorAll(".row.bot");
  for (let i = botRows.length - 1; i >= 0; i -= 1) {
    const row = botRows[i];
    if (row.querySelector(".bubble.loading")) {
      return row.querySelector(".bubble-stack");
    }
  }
  return null;
}

function shouldSkipPendingRender(prevMem, nextMem) {
  return isSamePendingMemory(prevMem, nextMem) && hasActiveLoadingBubble();
}

function buildBatchCountdownText(seconds) {
  return `将在${seconds}秒后发送，可继续输入以合并`;
}

function updateBatchCountdownStatus(personaId) {
  const personaState = getPersonaState(personaId);
  setStatusForPersona(personaId, buildBatchCountdownText(personaState.countdownRemaining));
}

function stopBatchCountdown(personaId) {
  const personaState = getPersonaState(personaId);
  if (!personaState.countdownTimerId) return;
  clearInterval(personaState.countdownTimerId);
  personaState.countdownTimerId = null;
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

export function stopPendingPoll(personaId) {
  const personaState = getPersonaState(personaId);
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
  const prevMemory = personaState.memory;
  if (personaState.pendingPollInFlight) return;
  personaState.pendingPollInFlight = true;
  const wasPending = prevMemory?.status === "pending";
  try {
    const mem = await getMemory(personaId);
    if (!hasPersona(personaId)) return;
    personaState.memory = mem;
    if (wasPending && mem?.status !== "pending") {
      personaState.animateNextAssistant = true;
    }
    const isPendingResolved = wasPending && mem?.status !== "pending";
    let renderedViaSegments = false;
    let deferReady = false;
    if (isPendingResolved && isActivePersona(personaId)) {
      const bubbleStack = getLoadingBubbleStack();
      const turns = Array.isArray(mem?.turns) ? mem.turns : [];
      const lastTurn = turns[turns.length - 1] || {};
      const assistantText = typeof lastTurn.assistant === "string" ? lastTurn.assistant : "";
      if (bubbleStack) {
        renderedViaSegments = true;
        deferReady = true;
        renderAssistantSegments(bubbleStack, assistantText, personaId, () => {
          const currentState = getPersonaState(personaId);
          currentState.animateNextAssistant = false;
          if (shouldRenderMemoryAfterSegments(mem)) {
            renderActiveMemory(personaId, mem);
          }
          setStatusForPersona(personaId, "就绪");
          setSendBusyForPersona(personaId, false);
          if (isActivePersona(personaId)) {
            els.input.focus();
          }
        });
      }
    }
    if (!renderedViaSegments && !shouldSkipPendingRender(prevMemory, mem)) {
      renderActiveMemory(personaId, mem);
    }
    const hasPending = mem?.status === "pending";
    if (!hasPending) {
      stopPendingPoll(personaId);
      if (!deferReady) {
        setSendBusyForPersona(personaId, false);
        setStatusForPersona(personaId, "就绪");
      }
    }
  } catch {
    // keep polling; if server is temporarily unavailable we can retry
  } finally {
    personaState.pendingPollInFlight = false;
  }
}

export function startPendingPoll(personaId) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (personaState.pendingPollId) return;
  personaState.pendingPollId = setInterval(() => {
    pollPendingOnce(personaId).catch(() => {});
  }, PENDING_POLL_INTERVAL_MS);
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
      requestAnimationFrame(() => {
        scrollToBottom({ behavior: "auto" });
      });
      if (typeof onDone === "function") onDone();
      return;
    }
    const timerId = setTimeout(pushNext, delayMs);
    personaState.assistantSegmentTimers.push(timerId);
  };
  pushNext();
  return true;
}

export function clearAssistantSegmentTimers(personaId) {
  const personaState = getPersonaStates().get(personaId);
  if (!personaState || !personaState.assistantSegmentTimers?.length) return;
  personaState.assistantSegmentTimers.forEach(id => clearTimeout(id));
  personaState.assistantSegmentTimers = [];
}

export function clearPersonaTimers(personaId) {
  const personaState = getPersonaStates().get(personaId);
  if (!personaState) return;
  clearAssistantSegmentTimers(personaId);
  if (personaState.batchTimerId) {
    clearTimeout(personaState.batchTimerId);
    personaState.batchTimerId = null;
  }
  if (personaState.countdownTimerId) {
    clearInterval(personaState.countdownTimerId);
    personaState.countdownTimerId = null;
  }
  stopPendingPoll(personaId);
}

export function renderActiveMemory(personaId, memory, options = {}) {
  if (!isActivePersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  const preserveScroll = options.preserveScroll !== false;
  const scrollBehavior = options.scrollBehavior || "auto";
  personaState.pendingUserElements = null;
  clearAssistantSegmentTimers(personaId);
  renderMemory(memory, {
    animateLastAssistant: personaState.animateNextAssistant,
    preserveScroll,
    scrollBehavior
  });
  personaState.animateNextAssistant = false;
  renderPendingQueueForActive(personaId);
}

export async function loadPersonaMemory(personaId, options = {}) {
  const mem = await getMemory(personaId);
  const personaState = getPersonaState(personaId);
  personaState.memory = mem;
  personaState.isGenerating = mem?.status === "pending";
  if (personaState.isGenerating) {
    personaState.pendingMessages = [];
    personaState.pendingUserElements = null;
    personaState.pendingUserTimestamp = null;
    clearPendingQueue(personaId);
  }

  if (!options.deferRender) {
    renderActiveMemory(personaId, mem, { preserveScroll: false });
    if (isActivePersona(personaId)) {
      updateSendButtonForActive();
    }
  }

  return mem;
}

function loadPendingQueue(personaId) {
  const raw = readLocalValue(getPendingQueueKey(personaId));
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
    clearLocalValue(getPendingQueueKey(personaId));
    return;
  }
  const payload = {
    messages: personaState.pendingMessages.slice(),
    sendAt: Number.isFinite(sendAt) ? sendAt : Date.now(),
    ts: personaState.pendingUserTimestamp || new Date().toISOString()
  };
  writeLocalValue(getPendingQueueKey(personaId), JSON.stringify(payload));
}

export function clearPendingQueue(personaId) {
  clearLocalValue(getPendingQueueKey(personaId));
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

export function restorePendingQueue(personaId, render) {
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
  if (isActivePersona(personaId)) {
    updateSendButtonForActive();
  }
  return true;
}

function scheduleBatchSend(personaId) {
  const delayMs = getSendDelayMs();
  const sendAt = Date.now() + Math.max(0, delayMs);
  savePendingQueue(personaId, sendAt);
  scheduleBatchSendWithDelay(personaId, delayMs);
}

export function queueMessage(personaId, text) {
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
  updateSendButtonForActive();
}

async function flushPendingMessages(personaId) {
  if (!hasPersona(personaId)) return;
  const personaState = getPersonaState(personaId);
  if (personaState.isGenerating || personaState.pendingMessages.length === 0) return;
  stopBatchCountdown(personaId);
  const combinedText = personaState.pendingMessages.join("$");
  const pendingDisplay = personaState.pendingUserElements;
  personaState.pendingMessages = [];
  personaState.pendingUserElements = null;
  personaState.pendingUserTimestamp = null;
  clearPendingQueue(personaId);

  const controller = new AbortController();
  personaState.pendingRequestController = controller;
  personaState.pendingSendText = combinedText;
  personaState.ignorePendingResponse = false;

  setSendBusyForPersona(personaId, true);
  setStatusForPersona(personaId, "对方输入中...");
  const botPlaceholder = isActivePersona(personaId) ? addTempBotMessage("", true) : null;

  let releaseAfterSegments = false;
  let animationDone = false;
  let finalMemory = null;
  try {
    const result = await sendChat(combinedText, personaId, { signal: controller.signal });
    if (!hasPersona(personaId)) return;
    if (personaState.ignorePendingResponse) return;
    personaState.animateNextAssistant = isActivePersona(personaId);

    if (isActivePersona(personaId) && botPlaceholder?.bubbleStack) {
      releaseAfterSegments = renderAssistantSegments(
        botPlaceholder.bubbleStack,
        result.assistantMessage || "",
        personaId,
        () => {
          animationDone = true;
          if (finalMemory && isActivePersona(personaId)) {
            finalizeSegmentedRender(personaId, finalMemory, pendingDisplay, botPlaceholder);
          }
          setStatusForPersona(personaId, "就绪");
          setSendBusyForPersona(personaId, false);
          if (isActivePersona(personaId)) {
            els.input.focus();
          }
        }
      );
    }

    const mem = await getMemory(personaId);
    personaState.memory = mem;
    if (releaseAfterSegments) {
      finalMemory = mem;
      if (animationDone && isActivePersona(personaId)) {
        finalizeSegmentedRender(personaId, mem, pendingDisplay, botPlaceholder);
      }
    } else {
      renderActiveMemory(personaId, mem);
    }

    if (!releaseAfterSegments) {
      setStatusForPersona(personaId, "就绪");
    }
  } catch (e) {
    if (!hasPersona(personaId)) return;
    if (controller.signal.aborted || personaState.ignorePendingResponse) return;
    personaState.animateNextAssistant = false;
    if (botPlaceholder?.row) botPlaceholder.row.remove();
    if (isActivePersona(personaId) && pendingDisplay?.row) pendingDisplay.row.remove();
    setStatusForPersona(personaId, `请求失败：${e.message}`);
    personaState.draft = combinedText;
    if (isActivePersona(personaId)) {
      els.input.value = combinedText;
    }
    try {
      const mem = await getMemory(personaId);
      personaState.memory = mem;
      renderActiveMemory(personaId, mem);
    } catch {
      // ignore refresh errors
    }
  } finally {
    if (!hasPersona(personaId)) return;
    if (personaState.pendingRequestController === controller) {
      personaState.pendingRequestController = null;
    }
    if (personaState.pendingSendText === combinedText) {
      personaState.pendingSendText = "";
    }
    personaState.ignorePendingResponse = false;
    if (!releaseAfterSegments) {
      setSendBusyForPersona(personaId, false);
      if (isActivePersona(personaId)) {
        els.input.focus();
      }
    }
  }
}

export async function sendMessage() {
  const personaId = state.activePersonaId;
  if (!personaId) return;
  const personaState = getPersonaState(personaId);
  if (canCancelPending(personaState)) {
    await cancelPendingResponse(personaId);
    return;
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

export function undoLastPending() {
  const personaId = state.activePersonaId;
  if (!personaId) return false;
  return undoPendingMessage(personaId);
}
