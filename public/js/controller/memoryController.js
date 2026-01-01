import { els } from "../dom.js";
import { state } from "../store/appState.js";
import { getMemory, setMemory } from "../api/memoryApi.js";
import { fetchConfig } from "../api/configApi.js";
import { showModal, hideModal } from "../ui/modals.js";
import { setStatusText } from "../ui/status.js";
import { applyFontFamily } from "../ui/layout.js";
import { getPersonaState } from "../store/personaState.js";
import { renderActiveMemory } from "./chatController.js";

function setMemoryError(message, isError = true) {
  if (!els.memoryError) return;
  const text = String(message || "").trim();
  if (!text) {
    els.memoryError.textContent = "";
    els.memoryError.classList.add("hidden");
    return;
  }
  els.memoryError.textContent = text;
  els.memoryError.classList.remove("hidden");
  els.memoryError.classList.toggle("error-hint", Boolean(isError));
  els.memoryError.classList.toggle("hint", !isError);
}

export async function openMemory() {
  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }
  try {
    const mem = await getMemory(state.activePersonaId);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    els.memoryEditor.value = JSON.stringify(mem, null, 2);
    setMemoryError("");
    showModal(els.modalMemory);
  } catch (err) {
    if (els.memoryEditor) {
      els.memoryEditor.value = "";
    }
    setMemoryError(`加载失败：${err.message}`);
    showModal(els.modalMemory);
  }
}

export async function reloadMemory() {
  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }
  try {
    const mem = await getMemory(state.activePersonaId);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    els.memoryEditor.value = JSON.stringify(mem, null, 2);
    setMemoryError("记忆已重新加载", false);
  } catch (err) {
    setMemoryError(`加载失败：${err.message}`);
  }
}

export async function saveMemory() {
  let parsed;
  try {
    parsed = JSON.parse(els.memoryEditor.value);
  } catch {
    setMemoryError("记忆 JSON 解析失败：请确认是合法 JSON。");
    return;
  }

  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }

  try {
    await setMemory(state.activePersonaId, parsed);

    const cfg = await fetchConfig();
    state.config = cfg;
    applyFontFamily(state.config.fontFamily);

    const mem = await getMemory(state.activePersonaId);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    renderActiveMemory(state.activePersonaId, mem);

    setMemoryError("");
    hideModal(els.modalMemory);
    setStatusText("记忆已保存");
  } catch (err) {
    setMemoryError(`保存失败：${err.message}`);
  }
}

export async function clearMemory() {
  const ok = confirm("确认清空记忆？此操作不可撤销。");
  if (!ok) return;

  if (!state.activePersonaId) {
    setStatusText("Select a persona first.");
    return;
  }

  try {
    await setMemory(state.activePersonaId, { turns: [] });

    const cfg = await fetchConfig();
    state.config = cfg;
    applyFontFamily(state.config.fontFamily);

    const mem = await getMemory(state.activePersonaId);
    const personaState = getPersonaState(state.activePersonaId);
    personaState.memory = mem;
    personaState.isGenerating = mem?.status === "pending";
    renderActiveMemory(state.activePersonaId, mem);

    setMemoryError("");
    hideModal(els.modalMemory);
    setStatusText("记忆已清空");
  } catch (err) {
    setMemoryError(`清空失败：${err.message}`);
  }
}
