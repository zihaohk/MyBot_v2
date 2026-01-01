import { els, defaultTitleText, defaultSubtitleText } from "../dom.js";
import { state } from "../store/appState.js";
import { getPersonaState, deletePersonaState } from "../store/personaState.js";
import { hasPersona } from "../store/personaSelectors.js";
import { readSessionValue, writeSessionValue, clearSessionValue } from "../store/storage.js";
import { ACTIVE_PERSONA_KEY, ACTIVE_PERSONA_NAME_KEY, PERSONA_ID_PATTERN } from "../constants.js";
import {
  renderPersonaList,
  clearPersonaDropIndicator,
  updatePersonaDropIndicator,
  getPersonaDropIndex
} from "../ui/personaList.js";
import { showModal, hideModal } from "../ui/modals.js";
import { setStatusText } from "../ui/status.js";
import { setPersonaPanelCollapsed } from "../ui/layout.js";
import {
  listPersonas,
  createPersona as apiCreatePersona,
  deletePersona as apiDeletePersona,
  setPersonaOrder,
  getPersonaContent,
  setPersonaContent
} from "../api/personaApi.js";
import { renderMemory } from "../ui/chatRender.js";
import {
  applyStatusForPersona,
  clearAssistantSegmentTimers,
  clearPendingQueue,
  clearPersonaTimers,
  loadPersonaMemory,
  renderActiveMemory,
  renderPendingQueueForActive,
  setSendBusyForPersona,
  startPendingPoll,
  stopPendingPoll
} from "./chatController.js";

function setPersonaError(message, isError = true) {
  if (!els.personaError) return;
  const text = String(message || "").trim();
  if (!text) {
    els.personaError.textContent = "";
    els.personaError.classList.add("hidden");
    return;
  }
  els.personaError.textContent = text;
  els.personaError.classList.remove("hidden");
  els.personaError.classList.toggle("error-hint", Boolean(isError));
  els.personaError.classList.toggle("hint", !isError);
}

const CHAT_FADE_MS = 180;
let chatFadeTimerId = null;

function fadeOutChatList() {
  if (!els.chatList) return Promise.resolve();
  if (chatFadeTimerId) {
    clearTimeout(chatFadeTimerId);
    chatFadeTimerId = null;
  }
  els.chatList.classList.remove("chat-fade-hidden");
  void els.chatList.offsetWidth;
  els.chatList.classList.add("chat-fade-hidden");
  return new Promise(resolve => {
    chatFadeTimerId = setTimeout(() => {
      chatFadeTimerId = null;
      resolve();
    }, CHAT_FADE_MS);
  });
}

function fadeInChatList() {
  if (!els.chatList) return;
  requestAnimationFrame(() => {
    els.chatList.classList.remove("chat-fade-hidden");
  });
}

let draggingPersonaId = null;

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
  await setPersonaOrder(order);
}

function getPersonaDisplayName(personaId) {
  if (!personaId) return defaultTitleText;
  const persona = state.personas.find(item => item.id === personaId);
  return persona?.name || personaId || defaultTitleText;
}

function renderPersonaListWithEvents() {
  const items = renderPersonaList(state.personas, state.activePersonaId);
  for (const item of items) {
    const personaId = item.dataset.personaId;
    item.addEventListener("dblclick", () => {
      const nextId = personaId === state.activePersonaId ? null : personaId;
      const fadePromise = nextId ? fadeOutChatList() : null;
      if (nextId) {
        setPersonaPanelCollapsed(true);
      }
      setActivePersona(nextId, { skipFade: true, fadePromise }).catch(err => setStatusText(`Load failed: ${err.message}`));
    });
    item.addEventListener("dragstart", (ev) => {
      draggingPersonaId = personaId;
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", personaId);
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
  }
}

export function bindPersonaListEvents() {
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
    renderPersonaListWithEvents();
    persistPersonaOrder().catch(err => {
      setStatusText(`Order save failed: ${err.message}`);
      loadPersonas().catch(() => {});
    });
  });
}

export function updateTitle() {
  if (!els.title) return;
  const name = getPersonaDisplayName(state.activePersonaId);
  els.title.textContent = name;
  if (state.activePersonaId) {
    writeSessionValue(ACTIVE_PERSONA_NAME_KEY, name);
  } else {
    clearSessionValue(ACTIVE_PERSONA_NAME_KEY);
  }
}

export function updateComposerVisibility() {
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

export async function loadPersonas() {
  const resp = await listPersonas();
  const personas = Array.isArray(resp?.personas) ? resp.personas : [];
  state.personas = personas;
  renderPersonaListWithEvents();
  return state.personas;
}

export function pickInitialPersonaId() {
  const stored = readSessionValue(ACTIVE_PERSONA_KEY);
  if (stored && state.personas.some(persona => persona.id === stored)) {
    return stored;
  }
  return state.personas.length ? state.personas[0].id : null;
}

export async function setActivePersona(personaId, options = {}) {
  const nextId = personaId && hasPersona(personaId) ? personaId : null;
  if (nextId === state.activePersonaId && !options.forceReload) {
    return;
  }

  const prevId = state.activePersonaId;
  const shouldFade = Boolean(prevId && nextId && prevId !== nextId);
  const fadePromise = shouldFade
    ? (options.fadePromise || (!options.skipFade ? fadeOutChatList() : null))
    : null;
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
  renderPersonaListWithEvents();

  if (!state.activePersonaId) {
    setStatusText(defaultSubtitleText || "就绪");
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
    const mem = await loadPersonaMemory(state.activePersonaId, { deferRender: Boolean(fadePromise) });
    if (shouldFade && fadePromise) {
      await fadePromise;
      renderActiveMemory(state.activePersonaId, mem);
      fadeInChatList();
    }
  } else if (shouldFade && fadePromise) {
    await fadePromise;
    renderMemory(personaState.memory);
    fadeInChatList();
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

export function isValidPersonaId(personaId) {
  return PERSONA_ID_PATTERN.test(personaId);
}

export function openCreatePersonaModal() {
  els.personaIdInput.value = "";
  els.personaNameInput.value = "";
  setCreatePersonaError("");
  showModal(els.modalCreatePersona);
}

export function setCreatePersonaError(message) {
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

export async function createPersona() {
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

  const created = await apiCreatePersona({ id, name });
  setCreatePersonaError("");
  hideModal(els.modalCreatePersona);

  await loadPersonas();
  await setActivePersona(created.id, { forceReload: true });
}

export async function deleteActivePersona() {
  const personaId = state.activePersonaId;
  if (!personaId) {
    setStatusText("Select a persona first.");
    return;
  }
  const ok = confirm("确认删除该人设？此操作不可撤销。");
  if (!ok) return;

  await apiDeletePersona(personaId);

  clearPendingQueue(personaId);
  clearPersonaTimers(personaId);
  deletePersonaState(personaId);

  state.personas = state.personas.filter(persona => persona.id !== personaId);
  state.activePersonaId = null;
  clearSessionValue(ACTIVE_PERSONA_KEY);
  updateComposerVisibility();
  updateTitle();
  renderPersonaListWithEvents();
  setStatusText(defaultSubtitleText || "就绪");
}

export async function openPersona() {
  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }
  try {
    const { content } = await getPersonaContent(state.activePersonaId);
    els.personaEditor.value = content;
    setPersonaError("");
    showModal(els.modalPersona);
  } catch (err) {
    els.personaEditor.value = "";
    setPersonaError(`加载失败：${err.message}`);
    showModal(els.modalPersona);
  }
}

export async function reloadPersona() {
  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }
  try {
    const { content } = await getPersonaContent(state.activePersonaId);
    els.personaEditor.value = content;
    await loadPersonas();
    updateTitle();
    setPersonaError("人设已重新加载", false);
  } catch (err) {
    setPersonaError(`加载失败：${err.message}`);
  }
}

export async function savePersona() {
  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }
  try {
    await setPersonaContent(state.activePersonaId, els.personaEditor.value);
    await loadPersonas();
    updateTitle();
    setPersonaError("");
    hideModal(els.modalPersona);
    setStatusText("人设已保存");
  } catch (err) {
    setPersonaError(`保存失败：${err.message}`);
  }
}
