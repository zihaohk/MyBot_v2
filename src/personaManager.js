const path = require("path");
const fs = require("fs/promises");
const { exists, ensureDir, writeFileAtomic } = require("./fsUtil");
const { DEFAULT_PERSONA } = require("./personaStore");

const PERSONAS_DIR = path.join(__dirname, "..", "data", "personas");
const PERSONA_ORDER_PATH = path.join(PERSONAS_DIR, "order.json");
const DEFAULT_PERSONA_ID = "default";
const DEFAULT_PERSONA_NAME = "情感聊天机器人";

const LEGACY_PERSONA_PATH = path.join(__dirname, "..", "data", "persona.md");
const LEGACY_MEMORY_PATH = path.join(__dirname, "..", "data", "memory.json");
const PERSONA_SECTIONS = ["角色", "任务", "外表", "经历", "性格", "经典台词", "喜好", "备注"];

function buildPersonaTemplate(name) {
  const safeName = String(name || "").trim();
  const lines = ["# 人设", "", "## 名字", "", safeName, ""];
  for (const section of PERSONA_SECTIONS) {
    lines.push(`## ${section}`, "", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
const personaNameCollator = (() => {
  try {
    return new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "base", numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
})();

function getPersonaDir(personaId) {
  return path.join(PERSONAS_DIR, personaId || DEFAULT_PERSONA_ID);
}

function getPersonaPath(personaId) {
  return path.join(getPersonaDir(personaId), "persona.md");
}

function getMemoryPath(personaId) {
  return path.join(getPersonaDir(personaId), "memory.json");
}

function isValidPersonaId(personaId) {
  return typeof personaId === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(personaId);
}

function extractPersonaName(content) {
  const lines = String(content || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "##名字" || line === "## 名字") {
      for (let j = i + 1; j < lines.length; j++) {
        const name = lines[j].trim();
        if (name) return name;
      }
      return "";
    }
  }
  return "";
}

function ensureNameHeader(content, displayName) {
  const raw = String(content || "");
  if (/^##\s*名字\s*$/m.test(raw)) {
    return raw;
  }
  const trimmed = raw.replace(/^\s+/, "");
  const header = `## 名字\n${displayName}\n`;
  return trimmed ? `${header}${trimmed}` : header;
}

async function ensureDefaultPersona() {
  await ensureDir(PERSONAS_DIR);
  await ensureDir(getPersonaDir(DEFAULT_PERSONA_ID));

  const personaPath = getPersonaPath(DEFAULT_PERSONA_ID);
  const memoryPath = getMemoryPath(DEFAULT_PERSONA_ID);

  let personaContent = null;
  if (await exists(personaPath)) {
    personaContent = await fs.readFile(personaPath, "utf8");
  } else if (await exists(LEGACY_PERSONA_PATH)) {
    personaContent = await fs.readFile(LEGACY_PERSONA_PATH, "utf8");
  } else {
    personaContent = DEFAULT_PERSONA;
  }
  const withName = ensureNameHeader(personaContent, DEFAULT_PERSONA_NAME);
  if (!(await exists(personaPath)) || withName !== personaContent) {
    await writeFileAtomic(personaPath, withName, "utf8");
  }

  if (!(await exists(memoryPath))) {
    if (await exists(LEGACY_MEMORY_PATH)) {
      await fs.rename(LEGACY_MEMORY_PATH, memoryPath);
    } else {
      const init = { status: "done", turns: [] };
      await writeFileAtomic(memoryPath, JSON.stringify(init, null, 2), "utf8");
    }
  }

  if (await exists(LEGACY_PERSONA_PATH)) {
    try {
      await fs.unlink(LEGACY_PERSONA_PATH);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function listPersonas() {
  if (!(await exists(PERSONAS_DIR))) return [];
  const entries = await fs.readdir(PERSONAS_DIR, { withFileTypes: true });
  const personas = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const personaPath = getPersonaPath(id);
    if (!(await exists(personaPath))) continue;
    const content = await fs.readFile(personaPath, "utf8");
    const name = extractPersonaName(content) || id;
    personas.push({ id, name });
  }
  const order = await getPersonaOrder();
  if (!order.length) {
    return personas.sort((a, b) => personaNameCollator.compare(a.name || a.id, b.name || b.id));
  }

  const byId = new Map(personas.map(persona => [persona.id, persona]));
  const ordered = [];
  for (const id of order) {
    const persona = byId.get(id);
    if (persona) {
      ordered.push(persona);
      byId.delete(id);
    }
  }
  const remaining = Array.from(byId.values()).sort((a, b) =>
    personaNameCollator.compare(a.name || a.id, b.name || b.id)
  );
  return ordered.concat(remaining);
}

async function createPersona(personaId, displayName) {
  if (!isValidPersonaId(personaId)) {
    const err = new Error("Invalid persona id");
    err.statusCode = 400;
    err.publicMessage = "persona id is invalid";
    throw err;
  }
  const name = String(displayName || "").trim();
  if (!name) {
    const err = new Error("Invalid persona name");
    err.statusCode = 400;
    err.publicMessage = "persona name is required";
    throw err;
  }

  const dir = getPersonaDir(personaId);
  if (await exists(dir)) {
    const err = new Error("Persona already exists");
    err.statusCode = 400;
    err.publicMessage = "persona already exists";
    throw err;
  }

  await ensureDir(dir);
  const personaPath = getPersonaPath(personaId);
  const memoryPath = getMemoryPath(personaId);
  const content = buildPersonaTemplate(name);
  await writeFileAtomic(personaPath, content, "utf8");
  const init = { status: "done", turns: [] };
  await writeFileAtomic(memoryPath, JSON.stringify(init, null, 2), "utf8");

  if (await exists(PERSONA_ORDER_PATH)) {
    const order = await getPersonaOrder();
    order.push(personaId);
    await setPersonaOrder(order);
  }

  return { id: personaId, name };
}

async function deletePersona(personaId) {
  if (!isValidPersonaId(personaId)) {
    const err = new Error("Invalid persona id");
    err.statusCode = 400;
    err.publicMessage = "persona id is invalid";
    throw err;
  }
  const dir = getPersonaDir(personaId);
  if (!(await exists(dir))) {
    const err = new Error("Persona not found");
    err.statusCode = 404;
    err.publicMessage = "persona not found";
    throw err;
  }
  await fs.rm(dir, { recursive: true, force: true });

  if (await exists(PERSONA_ORDER_PATH)) {
    const order = await getPersonaOrder();
    const next = order.filter(id => id !== personaId);
    await setPersonaOrder(next);
  }
}

async function personaExists(personaId) {
  if (!isValidPersonaId(personaId)) return false;
  return await exists(getPersonaDir(personaId));
}

async function getPersonaOrder() {
  if (!(await exists(PERSONA_ORDER_PATH))) return [];
  const raw = await fs.readFile(PERSONA_ORDER_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  return parsed.filter(id => {
    if (typeof id !== "string" || !isValidPersonaId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function setPersonaOrder(order) {
  const list = Array.isArray(order) ? order : [];
  const seen = new Set();
  const sanitized = list.filter(id => {
    if (typeof id !== "string" || !isValidPersonaId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  await ensureDir(PERSONAS_DIR);
  await writeFileAtomic(PERSONA_ORDER_PATH, JSON.stringify(sanitized, null, 2), "utf8");
  return sanitized;
}

module.exports = {
  PERSONAS_DIR,
  DEFAULT_PERSONA_ID,
  DEFAULT_PERSONA_NAME,
  getPersonaDir,
  getPersonaPath,
  getMemoryPath,
  isValidPersonaId,
  extractPersonaName,
  ensureNameHeader,
  ensureDefaultPersona,
  listPersonas,
  createPersona,
  deletePersona,
  personaExists,
  getPersonaOrder,
  setPersonaOrder
};
