const path = require("path");
const fs = require("fs/promises");
const { exists, writeFileAtomic } = require("./fsUtil");

const MEMORY_PATH = path.join(__dirname, "..", "data", "memory.json");

const DEFAULT_MEMORY = {
  turns: []
};

function normalizeMemoryStatus(mem, turns) {
  if (mem?.status === "pending" || mem?.status === "done") {
    return mem.status;
  }
  const hasPending = Array.isArray(turns) && turns.some(t => t?.status === "pending" || t?.pending === true);
  if (hasPending) return "pending";
  if (Array.isArray(turns) && turns.length > 0) {
    const last = turns[turns.length - 1];
    const assistant = typeof last?.assistant === "string" ? last.assistant.trim() : "";
    if (!assistant) return "pending";
  }
  return "done";
}

function normalizeTurn(turn) {
  return {
    ts: typeof turn.ts === "string" ? turn.ts : new Date().toISOString(),
    user: typeof turn.user === "string" ? turn.user : "",
    assistant: typeof turn.assistant === "string" ? turn.assistant : ""
  };
}

function trimTurns(turns, keep, status) {
  const extra = status === "pending" ? 1 : 0;
  const limit = keep + extra;
  if (turns.length > limit) {
    return turns.slice(turns.length - limit);
  }
  return turns;
}

function normalizeMemory(mem) {
  const out = { ...(mem || {}) };
  const turns = Array.isArray(out.turns) ? out.turns : [];

  // normalize each turn
  const normalizedTurns = turns
    .filter(t => t && typeof t === "object")
    .map(t => normalizeTurn(t));

  let status = normalizeMemoryStatus(out, turns);
  if (normalizedTurns.length === 0) {
    status = "done";
  }

  delete out.version;
  delete out.updatedAt;

  return { ...out, status, turns: normalizedTurns };
}

async function getMemory() {
  if (!(await exists(MEMORY_PATH))) {
    const init = normalizeMemory(DEFAULT_MEMORY);
    await writeFileAtomic(MEMORY_PATH, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
  const raw = await fs.readFile(MEMORY_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = DEFAULT_MEMORY;
  }
  const norm = normalizeMemory(parsed);
  // self-heal
  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function setMemory(memObject) {
  const norm = normalizeMemory(memObject);
  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function appendPendingTurn(user, memoryTurns) {
  const mem = await getMemory();
  const norm = normalizeMemory(mem);
  const turn = {
    ts: new Date().toISOString(),
    user: typeof user === "string" ? user : "",
    assistant: ""
  };

  norm.turns.push(turn);
  norm.status = "pending";

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return turn;
}

async function resolvePendingTurn(assistant, memoryTurns) {
  const mem = await getMemory();
  const norm = normalizeMemory(mem);

  const idx = norm.turns.length - 1;
  if (idx === -1) return null;

  const current = norm.turns[idx];
  norm.turns[idx] = {
    ...current,
    assistant: typeof assistant === "string" ? assistant : ""
  };
  norm.status = "done";

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm.turns[idx];
}

async function rollbackPendingTurn(memoryTurns) {
  const mem = await getMemory();
  const norm = normalizeMemory(mem);

  if (norm.turns.length === 0) {
    if (norm.status !== "done") {
      norm.status = "done";
      await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
    }
    return null;
  }

  if (norm.status !== "pending") {
    return null;
  }

  norm.turns.pop();
  norm.status = "done";

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

/**
 * Append one turn then keep last N turns.
 * If options.trimOnly is true, it only trims based on current file contents.
 */
async function appendTurnAndTrim(user, assistant, memoryTurns, options = {}) {
  const mem = await getMemory();
  const norm = normalizeMemory(mem);

  if (!options.trimOnly) {
    norm.turns.push({
      ts: new Date().toISOString(),
      user: typeof user === "string" ? user : "",
      assistant: typeof assistant === "string" ? assistant : ""
    });
    norm.status = "done";
  }

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  await writeFileAtomic(MEMORY_PATH, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

module.exports = {
  getMemory,
  setMemory,
  appendPendingTurn,
  resolvePendingTurn,
  rollbackPendingTurn,
  appendTurnAndTrim
};
