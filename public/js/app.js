import { els } from "./dom.js";
import { state } from "./store/appState.js";
import { getPersonaState } from "./store/personaState.js";
import { isActivePersona } from "./store/personaSelectors.js";
import { PANEL_COLLAPSED_CLASS } from "./constants.js";
import { fetchConfig } from "./api/configApi.js";
import { hideModal } from "./ui/modals.js";
import { setStatusText } from "./ui/status.js";
import { applyFontFamily, initLayout, setPersonaPanelCollapsed } from "./ui/layout.js";
import {
  bindPersonaListEvents,
  loadPersonas,
  pickInitialPersonaId,
  setActivePersona,
  openCreatePersonaModal,
  createPersona,
  setCreatePersonaError,
  deleteActivePersona,
  openPersona,
  reloadPersona,
  savePersona
} from "./controller/personaController.js";
import { openSettings, saveSettings, setSettingsError } from "./controller/settingsController.js";
import { openMemory, reloadMemory, saveMemory, clearMemory } from "./controller/memoryController.js";
import {
  applyStatusForPersona,
  restorePendingQueue,
  sendMessage,
  setSendBusyForPersona,
  setStatusForPersona,
  startPendingPoll,
  undoLastPending
} from "./controller/chatController.js";

initLayout();

if (els.personaToggle) {
  els.personaToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.contains(PANEL_COLLAPSED_CLASS);
    setPersonaPanelCollapsed(!collapsed);
  });
}

bindPersonaListEvents();

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
els.btnSaveSettings.addEventListener("click", () =>
  saveSettings().catch(err => setSettingsError(`保存失败：${err.message}`))
);

els.btnPersona.addEventListener("click", () => {
  openPersona();
});
els.btnReloadPersona.addEventListener("click", () => {
  reloadPersona();
});
els.btnSavePersona.addEventListener("click", () => {
  savePersona();
});

els.btnMemory.addEventListener("click", () => openMemory().catch(err => setStatusText(`加载记忆失败：${err.message}`)));
els.btnReloadMemory.addEventListener("click", () => reloadMemory().catch(err => setStatusText(`重新加载记忆失败：${err.message}`)));
els.btnSaveMemory.addEventListener("click", () => saveMemory().catch(err => setStatusText(`保存记忆失败：${err.message}`)));
els.btnClearMemory.addEventListener("click", () => clearMemory().catch(err => setStatusText(`清空记忆失败：${err.message}`)));

els.btnNewPersona.addEventListener("click", openCreatePersonaModal);
els.btnCreatePersona.addEventListener("click", () => createPersona().catch(err => setCreatePersonaError(`Create failed: ${err.message}`)));
els.btnDeletePersona.addEventListener("click", () => deleteActivePersona().catch(err => setStatusText(`Delete failed: ${err.message}`)));

els.btnSend.addEventListener("click", () => sendMessage().catch(err => setStatusText(`发送失败：${err.message}`)));
if (els.btnUndo) {
  els.btnUndo.addEventListener("click", () => {
    undoLastPending();
  });
}

els.input.addEventListener("input", () => {
  if (!state.activePersonaId) return;
  const personaState = getPersonaState(state.activePersonaId);
  personaState.draft = els.input.value;
});

els.input.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    sendMessage().catch(err => setStatusText(`发送失败：${err.message}`));
  }
});

async function loadAll() {
  const cfg = await fetchConfig();
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

// Initial load
loadAll().catch(err => {
  setStatusText(`初始化失败：${err.message}`);
});
