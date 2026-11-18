# NOVA AI

A bilingual Pakistani Urdu, Roman Urdu and English AI voice assistant built with React, TypeScript, Cloudflare Workers AI and D1.

## Production architecture
- Cloudflare Worker serves the Vite SPA and API routes.
- Cloudflare D1 stores conversations, memories, skills, notes, reminders and app configuration.
- Workers AI is the default inference provider through the `AI` binding.
- Optional `GEMINI_API_KEY` enables Gemini chat routing and audio transcription.
- The Worker is protected by Cloudflare Access. Sign-in is restricted to the account owner's email policy.

## Deployment
Cloudflare Workers Builds is connected to this GitHub repository and deploys from `main`. Each relevant push runs:
1. `bun install --frozen-lockfile`
2. TypeScript checks, unit tests and Vite production build
3. Idempotent remote D1 migration
4. `bunx wrangler deploy`

For a manual deploy:
```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
bun run db:migrate
bun run deploy
```

## Local development
- Copy `.env.example` to `.env` and add `GEMINI_API_KEY` if you want to use Gemini locally.
- Run `bun install` then `bun run dev`.
- The local Express server uses Node SQLite; production uses Cloudflare D1.

## Security and privacy
- Production is behind Cloudflare Access; keep the allow policy limited to trusted email identities.
- The current deployment is a single-user assistant, not a multi-tenant service.
- Never commit API keys, `.env` files, local SQLite databases, or Wrangler state.
