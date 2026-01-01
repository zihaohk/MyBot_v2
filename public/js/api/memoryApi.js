import { apiGet, apiPut } from "./request.js";

export function getMemory(personaId) {
  return apiGet(`/api/memory?personaId=${encodeURIComponent(personaId)}`);
}

export function setMemory(personaId, payload) {
  return apiPut(`/api/memory?personaId=${encodeURIComponent(personaId)}`, payload);
}
