const MODAL_ANIM_MS = 180;

function clearHideTimer(modalEl) {
  if (modalEl && modalEl._hideTimer) {
    clearTimeout(modalEl._hideTimer);
    modalEl._hideTimer = null;
  }
}

export function showModal(modalEl) {
  if (!modalEl) return;
  clearHideTimer(modalEl);
  modalEl.classList.remove("hidden");
  modalEl.classList.remove("is-closing");
  modalEl.classList.remove("is-open");
  void modalEl.offsetHeight;
  requestAnimationFrame(() => {
    modalEl.classList.add("is-open");
  });
}

export function hideModal(modalEl) {
  if (!modalEl) return;
  if (modalEl.classList.contains("hidden")) {
    modalEl.classList.remove("is-open");
    modalEl.classList.remove("is-closing");
    return;
  }
  clearHideTimer(modalEl);
  modalEl.classList.add("is-closing");
  modalEl.classList.remove("is-open");
  modalEl._hideTimer = setTimeout(() => {
    modalEl.classList.add("hidden");
    modalEl.classList.remove("is-closing");
    modalEl._hideTimer = null;
  }, MODAL_ANIM_MS);
}
