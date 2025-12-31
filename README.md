# emotion-bot (Node.js + Express + Static UI)

A minimal but complete persona + memory chatbot framework:

- Persona stored in `data/persona.md` (editable via UI)
- Memory stored in `data/memory.json` (editable via UI)
- Memory turns (one user + one assistant = one turn) adjustable via UI, default 20
- SiliconFlow OpenAI-compatible chat endpoint: /v1/chat/completions

## Run

1. npm install
2. cp .env.example .env  (fill SILICONFLOW_API_KEY)
3. npm start
4. Open http://localhost:3000

## Data files

- data/persona.md
- data/memory.json
- data/config.json

## API

- GET  /api/config
- PUT  /api/config
- GET  /api/persona
- PUT  /api/persona
- GET  /api/memory
- PUT  /api/memory
- POST /api/chat  { "userMessage": "..." }
