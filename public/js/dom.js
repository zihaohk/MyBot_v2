export const els = {
  chatList: document.getElementById("chatList"),
  input: document.getElementById("input"),
  btnSend: document.getElementById("btnSend"),
  btnSendText: document.querySelector("#btnSend .btn-text"),
  btnSendSpinner: document.querySelector("#btnSend .spinner"),
  btnUndo: document.getElementById("btnUndo"),
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
  settingsError: document.getElementById("settingsError"),

  personaEditor: document.getElementById("personaEditor"),
  personaError: document.getElementById("personaError"),
  btnSavePersona: document.getElementById("btnSavePersona"),
  btnReloadPersona: document.getElementById("btnReloadPersona"),

  memoryEditor: document.getElementById("memoryEditor"),
  memoryError: document.getElementById("memoryError"),
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

export const defaultTitleText = els.title ? els.title.textContent : "";
export const defaultSubtitleText = els.subtitle ? els.subtitle.textContent : "";
