# NOVA AI

Bilingual Pakistani Urdu, Roman Urdu and English AI assistant.

## Production
Cloudflare Worker serves the SPA and API. D1 stores chat, memories, skills, notes, reminders and settings. Workers AI uses the `AI` binding; Gemini is optional.

## Deploy
1. `bun install`
2. `bun run build`
3. `npx wrangler d1 execute nova-ai-production --remote --file=./migrations/0001_initial.sql`
4. Optional: `npx wrangler secret put GEMINI_API_KEY`
5. `npx wrangler deploy`
6. Verify `/api/health`.

Keep the single-user Worker behind Cloudflare Access until authentication and tenant isolation are implemented. Never commit secrets or local database files.