import { els } from "../dom.js";

export function renderPersonaList(personas, activePersonaId) {
  els.personaList.innerHTML = "";
  const items = [];
  for (const persona of personas) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "persona-item";
    item.draggable = true;
    item.dataset.personaId = persona.id;
    if (persona.id === activePersonaId) {
      item.classList.add("active");
    }
    item.textContent = persona.name || persona.id;
    els.personaList.appendChild(item);
    items.push(item);
  }
  return items;
}

export function getPersonaDropIndex(listEl, clientY) {
  const items = Array.from(listEl.querySelectorAll(".persona-item"));
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) return i;
  }
  return items.length;
}

export function clearPersonaDropIndicator() {
  const items = els.personaList.querySelectorAll(".persona-item.drop-before, .persona-item.drop-after");
  items.forEach(item => {
    item.classList.remove("drop-before");
    item.classList.remove("drop-after");
  });
}

export function updatePersonaDropIndicator(clientY) {
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
