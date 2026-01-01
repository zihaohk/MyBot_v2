import { state } from "./appState.js";
import { personaNameCollator } from "../constants.js";

export function getPersonaById(personaId) {
  return state.personas.find(persona => persona.id === personaId) || null;
}

export function hasPersona(personaId) {
  return state.personas.some(persona => persona.id === personaId);
}

export function isActivePersona(personaId) {
  return personaId && personaId === state.activePersonaId;
}

export function sortPersonas(list) {
  return list
    .slice()
    .sort((a, b) => personaNameCollator.compare(a?.name || a?.id || "", b?.name || b?.id || ""));
}
