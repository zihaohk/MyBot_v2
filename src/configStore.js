const path = require("path");
const fs = require("fs/promises");
const { exists, writeFileAtomic } = require("./fsUtil");

const CONFIG_PATH = path.join(__dirname, "..", "data", "config.json");
const FONT_KEYS = new Set([
  "system",
  "pingfang",
  "yahei",
  "noto",
  "song",
  "kaiti",
  "fangsong",
  "mono"
]);
const DEFAULT_CONFIG = {
  memoryTurns: 20,
  temperature: 0.7,
  topP: 0.7,
  sendDelayMs: 3000,
  maxTokens: 2048,
  assistantSegmentDelayMs: 800,
  fontFamily: "system"
};

function normalizeConfig(cfg) {
  const out = { ...DEFAULT_CONFIG, ...(cfg || {}) };

  const n = Number(out.memoryTurns);
  if (!Number.isFinite(n) || n < 1 || n > 200) {
    // clamp to safe range
    out.memoryTurns = DEFAULT_CONFIG.memoryTurns;
  } else {
    out.memoryTurns = Math.floor(n);
  }

  const temperature = Number(out.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    out.temperature = DEFAULT_CONFIG.temperature;
  } else {
    out.temperature = temperature;
  }

  const topP = Number(out.topP);
  if (!Number.isFinite(topP) || topP < 0 || topP > 1) {
    out.topP = DEFAULT_CONFIG.topP;
  } else {
    out.topP = topP;
  }

  const sendDelayMs = Number(out.sendDelayMs);
  if (!Number.isFinite(sendDelayMs) || sendDelayMs < 0 || sendDelayMs > 60000) {
    out.sendDelayMs = DEFAULT_CONFIG.sendDelayMs;
  } else {
    out.sendDelayMs = Math.round(sendDelayMs);
  }

  const maxTokens = Number(out.maxTokens);
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 200000) {
    out.maxTokens = DEFAULT_CONFIG.maxTokens;
  } else {
    out.maxTokens = Math.floor(maxTokens);
  }

  const assistantSegmentDelayMs = Number(out.assistantSegmentDelayMs);
  if (!Number.isFinite(assistantSegmentDelayMs) || assistantSegmentDelayMs < 0 || assistantSegmentDelayMs > 60000) {
    out.assistantSegmentDelayMs = DEFAULT_CONFIG.assistantSegmentDelayMs;
  } else {
    out.assistantSegmentDelayMs = Math.round(assistantSegmentDelayMs);
  }

  const fontFamily = typeof out.fontFamily === "string" ? out.fontFamily : DEFAULT_CONFIG.fontFamily;
  out.fontFamily = FONT_KEYS.has(fontFamily) ? fontFamily : DEFAULT_CONFIG.fontFamily;
  return out;
}

async function getConfig() {
  if (!(await exists(CONFIG_PATH))) {
    const init = normalizeConfig(DEFAULT_CONFIG);
    await writeFileAtomic(CONFIG_PATH, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = DEFAULT_CONFIG;
  }
  const norm = normalizeConfig(parsed);
  // self-heal
  await writeFileAtomic(CONFIG_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function setConfig({ memoryTurns, temperature, topP, sendDelayMs, maxTokens, assistantSegmentDelayMs, fontFamily }) {
  const current = await getConfig();
  const next = normalizeConfig({
    ...current,
    memoryTurns,
    temperature,
    topP,
    sendDelayMs,
    maxTokens,
    assistantSegmentDelayMs,
    fontFamily
  });
  await writeFileAtomic(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = {
  getConfig,
  setConfig
};
