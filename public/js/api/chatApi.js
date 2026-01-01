import { apiPost } from "./request.js";

export function sendChat(userMessage, personaId) {
  return apiPost("/api/chat", { userMessage, personaId });
}
