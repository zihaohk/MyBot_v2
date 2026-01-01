import { els } from "../dom.js";
import {
  FONT_FAMILY_MAP,
  PANEL_COLLAPSED_CLASS,
  UI_FONT_VALUE_KEY,
  ACTIVE_PERSONA_NAME_KEY,
  PANEL_STATE_KEY,
  APP_READY_CLASS,
  NO_PANEL_ANIM_CLASS
} from "../constants.js";
import { readSessionValue, writeSessionValue } from "../store/storage.js";

export function applyFontFamily(fontKey, options = {}) {
  const key = typeof fontKey === "string" ? fontKey : "system";
  const font = FONT_FAMILY_MAP[key] || FONT_FAMILY_MAP.system;
  document.documentElement.style.setProperty("--uiFont", font);
  if (options.persist !== false) {
    writeSessionValue(UI_FONT_VALUE_KEY, font);
  }
}

export function applySessionSnapshot() {
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

export function ensureSidebarLayout() {
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

export function setPersonaPanelCollapsed(collapsed, options = {}) {
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

export function getStoredPanelCollapsed() {
  const stored = readSessionValue(PANEL_STATE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return null;
}

export function initLayout() {
  ensureSidebarLayout();
  document.body.classList.add(NO_PANEL_ANIM_CLASS);
  applySessionSnapshot();

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
}
