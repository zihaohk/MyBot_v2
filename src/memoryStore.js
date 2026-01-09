const path = require("path");
const fs = require("fs/promises");
const { exists, writeFileAtomic } = require("./fsUtil");

const PERSONAS_DIR = path.join(__dirname, "..", "data", "personas");
const DEFAULT_PERSONA_ID = "default";

const DEFAULT_MEMORY = {
  turns: []
};

function createPendingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPersonaDir(personaId) {
  return path.join(PERSONAS_DIR, personaId || DEFAULT_PERSONA_ID);
}

function getMemoryPath(personaId) {
  return path.join(getPersonaDir(personaId), "memory.json");
}

async function assertPersonaDir(personaId) {
  const dir = getPersonaDir(personaId);
  if (!(await exists(dir))) {
    const err = new Error("Persona not found");
    err.statusCode = 404;
    err.publicMessage = "persona not found";
    throw err;
  }
  return dir;
}

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
  let pendingId = typeof out.pendingId === "string" ? out.pendingId : "";

  // normalize each turn
  const normalizedTurns = turns
    .filter(t => t && typeof t === "object")
    .map(t => normalizeTurn(t));

  let status = normalizeMemoryStatus(out, turns);
  if (normalizedTurns.length === 0) {
    status = "done";
  }

  if (status === "pending") {
    if (!pendingId) {
      pendingId = createPendingId();
    }
    out.pendingId = pendingId;
  } else {
    delete out.pendingId;
  }

  delete out.version;
  delete out.updatedAt;

  return { ...out, status, turns: normalizedTurns };
}

async function getMemory(personaId) {
  await assertPersonaDir(personaId);
  const memoryPath = getMemoryPath(personaId);
  if (!(await exists(memoryPath))) {
    const init = normalizeMemory(DEFAULT_MEMORY);
    await writeFileAtomic(memoryPath, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
  const raw = await fs.readFile(memoryPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = DEFAULT_MEMORY;
  }
  const norm = normalizeMemory(parsed);
  // self-heal
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function setMemory(personaId, memObject) {
  await assertPersonaDir(personaId);
  const memoryPath = getMemoryPath(personaId);
  const norm = normalizeMemory(memObject);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function appendPendingTurn(personaId, user, memoryTurns) {
  const mem = await getMemory(personaId);
  const norm = normalizeMemory(mem);
  const pendingId = createPendingId();
  const turn = {
    ts: new Date().toISOString(),
    user: typeof user === "string" ? user : "",
    assistant: ""
  };

  norm.turns.push(turn);
  norm.status = "pending";
  norm.pendingId = pendingId;

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  const memoryPath = getMemoryPath(personaId);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return { turn, pendingId };
}

async function resolvePendingTurn(personaId, assistant, memoryTurns, expectedPendingId) {
  const mem = await getMemory(personaId);
  const norm = normalizeMemory(mem);

  const idx = norm.turns.length - 1;
  if (idx === -1) return { ok: false, reason: "empty" };
  if (norm.status !== "pending") return { ok: false, reason: "not_pending" };
  if (expectedPendingId && norm.pendingId !== expectedPendingId) {
    return { ok: false, reason: "pending_id_mismatch" };
  }

  const current = norm.turns[idx];
  norm.turns[idx] = {
    ...current,
    assistant: typeof assistant === "string" ? assistant : ""
  };
  norm.status = "done";
  delete norm.pendingId;

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  const memoryPath = getMemoryPath(personaId);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return { ok: true, turn: norm.turns[idx], memory: norm };
}

async function rollbackPendingTurn(personaId, memoryTurns) {
  const mem = await getMemory(personaId);
  const norm = normalizeMemory(mem);

  if (norm.turns.length === 0) {
    if (norm.status !== "done") {
      norm.status = "done";
      delete norm.pendingId;
      const memoryPath = getMemoryPath(personaId);
      await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
    }
    return null;
  }

  if (norm.status !== "pending") {
    return null;
  }

  norm.turns.pop();
  norm.status = "done";
  delete norm.pendingId;

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  const memoryPath = getMemoryPath(personaId);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

async function cancelPendingTurn(personaId, memoryTurns) {
  const mem = await getMemory(personaId);
  const norm = normalizeMemory(mem);
  let removedTurn = null;

  if (norm.turns.length === 0) {
    if (norm.status !== "done") {
      norm.status = "done";
      delete norm.pendingId;
      const memoryPath = getMemoryPath(personaId);
      await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
    }
    return { memory: norm, removedTurn };
  }

  if (norm.status !== "pending") {
    return { memory: norm, removedTurn };
  }

  removedTurn = norm.turns.pop();
  norm.status = "done";
  delete norm.pendingId;

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  const memoryPath = getMemoryPath(personaId);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return { memory: norm, removedTurn };
}

/**
 * Append one turn then keep last N turns.
 * If options.trimOnly is true, it only trims based on current file contents.
 */
async function appendTurnAndTrim(personaId, user, assistant, memoryTurns, options = {}) {
  const mem = await getMemory(personaId);
  const norm = normalizeMemory(mem);

  if (!options.trimOnly) {
    norm.turns.push({
      ts: new Date().toISOString(),
      user: typeof user === "string" ? user : "",
      assistant: typeof assistant === "string" ? assistant : ""
    });
    norm.status = "done";
    delete norm.pendingId;
  }

  const n = Number(memoryTurns);
  const keep = Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  norm.turns = trimTurns(norm.turns, keep, norm.status);

  const memoryPath = getMemoryPath(personaId);
  await writeFileAtomic(memoryPath, JSON.stringify(norm, null, 2), "utf8");
  return norm;
}

module.exports = {
  getMemory,
  setMemory,
  appendPendingTurn,
  resolvePendingTurn,
  rollbackPendingTurn,
  cancelPendingTurn,
  appendTurnAndTrim
};
