export const state = {
  config: {
    memoryTurns: 20,
    temperature: 0.7,
    topP: 0.7,
    sendDelayMs: 3000,
    maxTokens: 2048,
    assistantSegmentDelayMs: 800,
    fontFamily: "system"
  },
  personas: [],
  activePersonaId: null
};
