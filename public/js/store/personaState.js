const personaStates = new Map();

export function getPersonaState(personaId) {
  if (!personaStates.has(personaId)) {
    personaStates.set(personaId, {
      memory: null,
      draft: "",
      pendingMessages: [],
      batchTimerId: null,
      pendingUserElements: null,
      isGenerating: false,
      statusMessage: "",
      assistantSegmentTimers: [],
      animateNextAssistant: false,
      countdownTimerId: null,
      countdownRemaining: 0,
      pendingUserTimestamp: null,
      pendingPollId: null,
      pendingPollInFlight: false
    });
  }
  return personaStates.get(personaId);
}

export function deletePersonaState(personaId) {
  personaStates.delete(personaId);
}

export function getPersonaStates() {
  return personaStates;
}
