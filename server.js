const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const { getConfig, setConfig } = require("./src/configStore");
const { getPersona, setPersona } = require("./src/personaStore");
const { getPrompt } = require("./src/promptStore");
const {
  getMemory,
  setMemory,
  appendPendingTurn,
  resolvePendingTurn,
  rollbackPendingTurn,
  cancelPendingTurn,
  appendTurnAndTrim
} = require("./src/memoryStore");
const {
  ensureDefaultPersona,
  listPersonas,
  createPersona,
  deletePersona,
  personaExists,
  isValidPersonaId,
  DEFAULT_PERSONA_ID,
  setPersonaOrder
} = require("./src/personaManager");
const { buildMessages } = require("./src/promptBuilder");
const { chatCompletions } = require("./src/siliconflowClient");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));

function resolvePersonaId(req) {
  const fromQuery = typeof req.query?.personaId === "string" ? req.query.personaId : "";
  const fromBody = typeof req.body?.personaId === "string" ? req.body.personaId : "";
  return (fromBody || fromQuery || DEFAULT_PERSONA_ID).trim();
}

// Static UI
app.use(express.static(path.join(__dirname, "public")));

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Config
app.get("/api/config", async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json(cfg);
  } catch (e) {
    next(e);
  }
});

app.put("/api/config", async (req, res, next) => {
  try {
    const { memoryTurns, temperature, topP, sendDelayMs, maxTokens, assistantSegmentDelayMs, fontFamily } = req.body || {};
    const updated = await setConfig({
      memoryTurns,
      temperature,
      topP,
      sendDelayMs,
      maxTokens,
      assistantSegmentDelayMs,
      fontFamily
    });

    // Optional: immediately trim memory to new turns
    const personas = await listPersonas();
    await Promise.all(
      personas.map(p => appendTurnAndTrim(p.id, null, null, updated.memoryTurns, { trimOnly: true }))
    );

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Personas
app.get("/api/personas", async (req, res, next) => {
  try {
    const personas = await listPersonas();
    res.json({ personas });
  } catch (e) {
    next(e);
  }
});

app.post("/api/personas", async (req, res, next) => {
  try {
    const { id, name } = req.body || {};
    const created = await createPersona(id, name);
    res.json(created);
  } catch (e) {
    next(e);
  }
});

app.put("/api/personas/order", async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array" });
    }
    const personas = await listPersonas();
    const existingIds = new Set(personas.map(persona => persona.id));
    const seen = new Set();
    const cleaned = [];
    for (const id of order) {
      if (typeof id !== "string") continue;
      if (!isValidPersonaId(id)) continue;
      if (!existingIds.has(id)) continue;
      if (seen.has(id)) continue;
      cleaned.push(id);
      seen.add(id);
    }
    for (const persona of personas) {
      if (!seen.has(persona.id)) {
        cleaned.push(persona.id);
        seen.add(persona.id);
      }
    }
    const saved = await setPersonaOrder(cleaned);
    res.json({ order: saved });
  } catch (e) {
    next(e);
  }
});

app.delete("/api/personas/:id", async (req, res, next) => {
  try {
    const personaId = req.params.id;
    await deletePersona(personaId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Persona
app.get("/api/persona", async (req, res, next) => {
  try {
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    const content = await getPersona(personaId);
    res.json({ content });
  } catch (e) {
    next(e);
  }
});

app.put("/api/persona", async (req, res, next) => {
  try {
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    const { content } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ error: "persona content must be a string" });
    }
    await setPersona(personaId, content);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Memory
app.get("/api/memory", async (req, res, next) => {
  try {
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    const mem = await getMemory(personaId);
    res.json(mem);
  } catch (e) {
    next(e);
  }
});

app.put("/api/memory", async (req, res, next) => {
  try {
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    const mem = req.body;
    const saved = await setMemory(personaId, mem);
    res.json(saved);
  } catch (e) {
    next(e);
  }
});

// Chat
app.post("/api/chat/cancel", async (req, res, next) => {
  try {
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    const cfg = await getConfig();
    const result = await cancelPendingTurn(personaId, cfg.memoryTurns);
    res.json({
      ok: true,
      cancelled: Boolean(result.removedTurn),
      userMessage: result.removedTurn?.user || "",
      memory: result.memory
    });
  } catch (e) {
    next(e);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const { userMessage } = req.body || {};
    const personaId = resolvePersonaId(req);
    if (!isValidPersonaId(personaId)) {
      return res.status(400).json({ error: "persona id is invalid" });
    }
    if (!(await personaExists(personaId))) {
      return res.status(404).json({ error: "persona not found" });
    }
    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ error: "userMessage must be a non-empty string" });
    }

    const cfg = await getConfig();
    const persona = await getPersona(personaId);
    const prePrompt = await getPrompt();
    const memory = await getMemory(personaId);
    const memoryTurns = Array.isArray(memory?.turns) ? memory.turns : [];
    const memoryForPromptTurns = memory?.status === "pending" && memoryTurns.length > 0
      ? memoryTurns.slice(0, memoryTurns.length - 1)
      : memoryTurns;
    const memoryForPrompt = { ...memory, turns: memoryForPromptTurns };

    const messages = buildMessages({
      prePromptMarkdown: prePrompt,
      personaMarkdown: persona,
      memoryObject: memoryForPrompt,
      memoryTurns: cfg.memoryTurns,
      userMessage: userMessage.trim()
    });

    const pendingResult = await appendPendingTurn(personaId, userMessage.trim(), cfg.memoryTurns);
    try {
      const llmResult = await chatCompletions({
        messages,
        temperature: cfg.temperature,
        topP: cfg.topP,
        maxTokens: cfg.maxTokens
      });

      const assistantMessage = (llmResult && llmResult.content) ? llmResult.content : "";

      // Resolve pending turn (fallback to append if missing)
      if (await personaExists(personaId)) {
        const resolved = await resolvePendingTurn(
          personaId,
          assistantMessage,
          cfg.memoryTurns,
          pendingResult?.pendingId
        );
        if (!resolved?.ok) {
          const shouldDiscard = resolved?.reason === "pending_id_mismatch" || resolved?.reason === "not_pending";
          if (shouldDiscard) {
            return res.json({
              assistantMessage,
              usage: llmResult.usage || null,
              model: llmResult.model || null,
              discarded: true
            });
          }
          await appendTurnAndTrim(personaId, userMessage.trim(), assistantMessage, cfg.memoryTurns);
        }
      }

      res.json({
        assistantMessage,
        usage: llmResult.usage || null,
        model: llmResult.model || null
      });
    } catch (e) {
      try {
        if (await personaExists(personaId)) {
          await rollbackPendingTurn(personaId, cfg.memoryTurns);
        }
      } catch (rollbackErr) {
        console.error("[ERROR] Failed to rollback pending turn:", rollbackErr);
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

// Unified error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const payload = {
    error: err.publicMessage || err.message || "Internal Server Error"
  };

  // For debugging (server logs only)
  console.error("[ERROR]", err);

  res.status(status).json(payload);
});

app.listen(PORT, async () => {
  // Ensure data files exist by touching stores
  try {
    await getConfig();
    await getPrompt();
    await ensureDefaultPersona();
    await getPersona(DEFAULT_PERSONA_ID);
    await getMemory(DEFAULT_PERSONA_ID);
  } catch (e) {
    console.error("Failed to initialize data files:", e);
  }

  console.log(`emotion-bot running at http://localhost:${PORT}`);
});
