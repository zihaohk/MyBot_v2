import { els } from "../dom.js";

export function setStatusText(message) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  els.subtitle.textContent = text;
}

export function updateSendButton({ busy, canUndo }) {
  if (els.btnSend) {
    els.btnSend.disabled = Boolean(busy);
    els.btnSend.classList.toggle("is-loading", Boolean(busy));
    if (els.btnSendSpinner) {
      els.btnSendSpinner.classList.toggle("hidden", !busy);
    }
    if (els.btnSendText) {
      els.btnSendText.textContent = "发送";
    }
  }
  if (els.btnUndo) {
    const showUndo = Boolean(canUndo);
    if (showUndo) {
      const wasHidden = els.btnUndo.classList.contains("undo-hidden");
      els.btnUndo.classList.remove("undo-hidden");
      if (wasHidden) {
        els.btnUndo.classList.add("pop");
        els.btnUndo.addEventListener("animationend", () => {
          els.btnUndo.classList.remove("pop");
        }, { once: true });
      }
    } else {
      els.btnUndo.classList.add("undo-hidden");
    }
    els.btnUndo.disabled = !showUndo || Boolean(busy);
  }
}
