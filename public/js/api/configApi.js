import { apiGet, apiPut } from "./request.js";

export function fetchConfig() {
  return apiGet("/api/config");
}

export function updateConfig(payload) {
  return apiPut("/api/config", payload);
}
