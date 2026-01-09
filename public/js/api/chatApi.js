import { apiPost } from "./request.js";

export function sendChat(userMessage, personaId, options = {}) {
  return apiPost("/api/chat", { userMessage, personaId }, options);
}

export function cancelChat(personaId) {
  return apiPost("/api/chat/cancel", { personaId });
}
