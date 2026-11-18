# NOVA AI

A bilingual (Pakistani Urdu, Roman Urdu and English) AI voice assistant built with React, TypeScript, Cloudflare Workers AI and D1.

## Production architecture
- Cloudflare Worker serves the Vite SPA and all `/api/*` routes.
- Cloudflare D1 stores configuration, chat history, memories, skills, notes and reminders.
- Workers AI is the default inference provider through the `AI` binding.
- Optional Gemini API secret enables Gemini chat and audio transcription.
- The local Express + SQLite server remains available for local development.

## Deploy
1. Install dependencies: `bun install` (or `npm install`).
2. Configure `wrangler.toml` with the D1 database ID from your Cloudflare account.
3. Add optional Gemini key: `npx wrangler secret put GEMINI_API_KEY`.
4. Build and deploy: `npm run build && npx wrangler deploy`.
5. Check `https://<worker-subdomain>/api/health`.

## Local development
- Copy `.env.example` to `.env` and add `GEMINI_API_KEY` or Cloudflare REST credentials.
- Run `npm run dev`.
- Run checks: `npm run lint`, `npm test`, `npm run build`.

## Data and privacy
Production user state is stored in D1. Treat the Worker URL as a private, single-user application until Cloudflare Access or application-level authentication is enabled. Do not put secrets in frontend variables or commit `.env`, database files, or credentials.
