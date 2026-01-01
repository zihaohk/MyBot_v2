import { els } from "../dom.js";
import { state } from "../store/appState.js";
import { DEFAULT_SEND_DELAY_MS } from "../constants.js";
import { updateConfig } from "../api/configApi.js";
import { getMemory } from "../api/memoryApi.js";
import { showModal, hideModal } from "../ui/modals.js";
import { setStatusText } from "../ui/status.js";
import { applyFontFamily } from "../ui/layout.js";
import { getPersonaState } from "../store/personaState.js";
import { renderActiveMemory } from "./chatController.js";

function getNumberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readNumberInput(inputEl) {
  const raw = String(inputEl?.value ?? "").trim();
  if (!raw) return NaN;
  return Number(raw);
}

function getFieldLabel(inputEl) {
  const label = inputEl?.closest?.(".field")?.querySelector?.(".label");
  const text = label?.textContent?.trim();
  return text || "参数";
}

function getRangeError(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${label} 需要在 ${min}-${max} 之间`;
  }
  return null;
}

export function setSettingsError(message) {
  if (!els.settingsError) return;
  const text = String(message || "").trim();
  if (!text) {
    els.settingsError.textContent = "";
    els.settingsError.classList.add("hidden");
    return;
  }
  els.settingsError.textContent = text;
  els.settingsError.classList.remove("hidden");
}

export async function openSettings() {
  setSettingsError("");
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

export async function saveSettings() {
  setSettingsError("");
  const n = readNumberInput(els.memoryTurnsInput);
  const temperature = readNumberInput(els.temperatureInput);
  const topP = readNumberInput(els.topPInput);
  const sendDelayMs = readNumberInput(els.sendDelayInput);
  const maxTokens = readNumberInput(els.maxTokensInput);
  const assistantSegmentDelayMs = els.assistantSegmentDelayInput
    ? readNumberInput(els.assistantSegmentDelayInput)
    : undefined;
  const fontFamily = els.fontFamilySelect?.value;

  const error = getRangeError(n, 1, 200, getFieldLabel(els.memoryTurnsInput))
    || getRangeError(temperature, 0, 2, getFieldLabel(els.temperatureInput))
    || getRangeError(topP, 0, 1, getFieldLabel(els.topPInput))
    || getRangeError(sendDelayMs, 0, 60000, getFieldLabel(els.sendDelayInput))
    || getRangeError(maxTokens, 1, 200000, getFieldLabel(els.maxTokensInput))
    || (els.assistantSegmentDelayInput
      ? getRangeError(assistantSegmentDelayMs, 0, 60000, getFieldLabel(els.assistantSegmentDelayInput))
      : null);
  if (error) {
    setSettingsError(`保存失败：${error}`);
    return;
  }
  const updated = await updateConfig({
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

  if (state.activePersonaId) {
    const mem = await getMemory(state.activePersonaId);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    renderActiveMemory(state.activePersonaId, mem);
  }

  hideModal(els.modalSettings);
  setStatusText("设置已保存");
}
