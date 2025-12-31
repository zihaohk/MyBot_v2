# emotion-bot

Node.js + Express + static UI chatbot with multi-persona support, per-persona memory, and a shared system prompt.

## Features

- Multiple personas stored under `data/personas/<id>/`
- Per-persona `persona.md` and `memory.json`
- Persona ordering stored in `data/personas/order.json`
- System prompt stored in `data/prompts/prompt.md`
- UI for persona, memory, and settings
- SiliconFlow OpenAI-compatible chat endpoint

## Run

1. `npm install`
2. `cp .env.example .env` (set `SILICONFLOW_API_KEY`)
3. `npm start`
4. Open `http://localhost:3000`

## Data layout

```text
data/
  config.json
  prompts/
    prompt.md
  personas/
    default/
      persona.md
      memory.json
    <personaId>/
      persona.md
      memory.json
    order.json
```

Notes:

- `data/config.json` and `data/prompts/prompt.md` are auto-created if missing.
- `personaId` must match `[A-Za-z0-9_-]{1,32}`.

## API

- `GET  /api/health`
- `GET  /api/config`
- `PUT  /api/config`
- `GET  /api/personas`
- `POST /api/personas` `{ id, name }`
- `DELETE /api/personas/:id`
- `PUT  /api/personas/order` `{ order: ["id1", "id2"] }`
- `GET  /api/persona?personaId=...`
- `PUT  /api/persona?personaId=...` `{ content }`
- `GET  /api/memory?personaId=...`
- `PUT  /api/memory?personaId=...`
- `POST /api/chat` `{ userMessage, personaId }`
