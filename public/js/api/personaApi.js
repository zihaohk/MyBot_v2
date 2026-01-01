import { apiGet, apiPost, apiDelete, apiPut } from "./request.js";

export function listPersonas() {
  return apiGet("/api/personas");
}

export function createPersona(payload) {
  return apiPost("/api/personas", payload);
}

export function deletePersona(personaId) {
  return apiDelete(`/api/personas/${encodeURIComponent(personaId)}`);
}

export function setPersonaOrder(order) {
  return apiPut("/api/personas/order", { order });
}

export function getPersonaContent(personaId) {
  return apiGet(`/api/persona?personaId=${encodeURIComponent(personaId)}`);
}

export function setPersonaContent(personaId, content) {
  return apiPut(`/api/persona?personaId=${encodeURIComponent(personaId)}`, { content });
}
