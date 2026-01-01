function resolveFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch;
  try {
    const nodeFetch = require("node-fetch");
    return nodeFetch.default || nodeFetch;
  } catch (err) {
    const error = new Error("Missing fetch implementation");
    error.statusCode = 500;
    error.publicMessage = "Server misconfigured: Node 18+ is required or install node-fetch";
    throw error;
  }
}

const fetchFn = resolveFetch();

function getApiBase() {
  const base = (process.env.SILICONFLOW_API_BASE || "https://api.siliconflow.cn/v1").trim();
  // Allow user to set full endpoint or just /v1
  if (base.endsWith("/chat/completions")) return base;
  return base.replace(/\/+$/, "") + "/chat/completions";
}

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    const err = new Error(`Missing required env: ${name}`);
    err.statusCode = 500;
    err.publicMessage = `Server misconfigured: ${name} is not set`;
    throw err;
  }
  return String(v).trim();
}

async function chatCompletions({ messages, temperature, topP, maxTokens }) {
  const apiKey = getRequiredEnv("SILICONFLOW_API_KEY");
  const url = getApiBase();

  const model = (process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V3").trim();
  const envTemperature = Number(process.env.SILICONFLOW_TEMPERATURE || 0.7);
  const envTopP = Number(process.env.SILICONFLOW_TOP_P || 0.7);
  const envMaxTokens = Number(process.env.SILICONFLOW_MAX_TOKENS || 2048);
  const inputTemperature = Number(temperature);
  const inputTopP = Number(topP);
  const inputMaxTokens = Number(maxTokens);
  const resolvedTemperature = Number.isFinite(inputTemperature)
    ? inputTemperature
    : (Number.isFinite(envTemperature) ? envTemperature : 0.7);
  const resolvedTopP = Number.isFinite(inputTopP)
    ? inputTopP
    : (Number.isFinite(envTopP) ? envTopP : 0.7);
  const resolvedMaxTokens = Number.isFinite(inputMaxTokens)
    ? inputMaxTokens
    : (Number.isFinite(envMaxTokens) ? envMaxTokens : 2048);

  const payload = {
    model,
    messages,
    stream: false,
    max_tokens: resolvedMaxTokens,
    enable_thinking: false,
    temperature: resolvedTemperature,
    top_p: resolvedTopP
  };

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const err = new Error(`SiliconFlow API error: HTTP ${resp.status}`);
    err.statusCode = 502;
    err.publicMessage = json?.error?.message || json?.message || text || `SiliconFlow API error ${resp.status}`;
    err.details = { status: resp.status, body: json || text };
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content ?? "";
  const usage = json?.usage ?? null;
  const returnedModel = json?.model ?? model;

  return { content, usage, model: returnedModel, raw: json };
}

module.exports = {
  chatCompletions
};
