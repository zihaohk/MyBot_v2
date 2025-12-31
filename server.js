const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const { getConfig, setConfig } = require("./src/configStore");
const { getPersona, setPersona } = require("./src/personaStore");
const { getPrompt } = require("./src/promptStore");
const { getMemory, setMemory, appendPendingTurn, resolvePendingTurn, rollbackPendingTurn, appendTurnAndTrim } = require("./src/memoryStore");
const { buildMessages } = require("./src/promptBuilder");
const { chatCompletions } = require("./src/siliconflowClient");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));

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
    const { memoryTurns, temperature, topP, sendDelayMs, maxTokens } = req.body || {};
    const updated = await setConfig({ memoryTurns, temperature, topP, sendDelayMs, maxTokens });

    // Optional: immediately trim memory to new turns
    await appendTurnAndTrim(null, null, updated.memoryTurns, { trimOnly: true });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Persona
app.get("/api/persona", async (req, res, next) => {
  try {
    const content = await getPersona();
    res.json({ content });
  } catch (e) {
    next(e);
  }
});

app.put("/api/persona", async (req, res, next) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ error: "persona content must be a string" });
    }
    await setPersona(content);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Memory
app.get("/api/memory", async (req, res, next) => {
  try {
    const mem = await getMemory();
    res.json(mem);
  } catch (e) {
    next(e);
  }
});

app.put("/api/memory", async (req, res, next) => {
  try {
    const mem = req.body;
    const saved = await setMemory(mem);
    res.json(saved);
  } catch (e) {
    next(e);
  }
});

// Chat
app.post("/api/chat", async (req, res, next) => {
  try {
    const { userMessage } = req.body || {};
    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ error: "userMessage must be a non-empty string" });
    }

    const cfg = await getConfig();
    const persona = await getPersona();
    const prePrompt = await getPrompt();
    const memory = await getMemory();
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

    await appendPendingTurn(userMessage.trim(), cfg.memoryTurns);
    try {
      const llmResult = await chatCompletions({
        messages,
        temperature: cfg.temperature,
        topP: cfg.topP,
        maxTokens: cfg.maxTokens
      });

      const assistantMessage = (llmResult && llmResult.content) ? llmResult.content : "";

      // Resolve pending turn (fallback to append if missing)
      const resolved = await resolvePendingTurn(assistantMessage, cfg.memoryTurns);
      if (!resolved) {
        await appendTurnAndTrim(userMessage.trim(), assistantMessage, cfg.memoryTurns);
      }

      res.json({
        assistantMessage,
        usage: llmResult.usage || null,
        model: llmResult.model || null
      });
    } catch (e) {
      try {
        await rollbackPendingTurn(cfg.memoryTurns);
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
    await getPersona();
    await getMemory();
  } catch (e) {
    console.error("Failed to initialize data files:", e);
  }

  console.log(`emotion-bot running at http://localhost:${PORT}`);
});
