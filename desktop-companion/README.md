# NOVA Desktop Companion (Windows)

This optional local agent lets the NOVA web app request a small, explicit set of desktop actions. It binds only to `127.0.0.1`, requires a random pairing token, checks the NOVA site origin, and exposes only an allowlist (Chrome, Edge, Notepad, Calculator, HTTP/HTTPS URLs). It does **not** provide arbitrary shell access, file-system access, keystroke injection, or remote desktop access.

## Requirements
- Windows 10/11
- Node.js 20+ or Bun
- NOVA repository dependencies installed (`bun install`)

## Start
Open PowerShell in the repository root:

```powershell
bun install
bun run desktop:companion
```

The terminal prints a one-time pairing token. Keep the terminal open and paste that token into the NOVA **Desktop Bridge** panel. Do not share it. Stop the companion with Ctrl+C.

Optional fixed token (store it securely; do not commit it):

```powershell
$env:NOVA_BRIDGE_TOKEN = "a-long-random-private-token"
bun run desktop:companion
```

## Voice
When paired, NOVA uses Microsoft Edge neural TTS locally:
- Urdu (Pakistan), female: `ur-PK-UzmaNeural`
- English (US), female: `en-US-JennyNeural`

This is cloud-backed speech synthesis, so it needs internet access. Voice availability and pronunciation can vary; test it on your device.

## Safety
- The companion accepts requests only from the production NOVA origin and local Vite development origins.
- Every request requires the pairing token.
- App launch is restricted to the four listed apps.
- URL opening accepts HTTP/HTTPS only.
- The companion has no remote port exposure; do not change the bind address to `0.0.0.0`.
- This is a local development companion, not a signed Windows installer or Windows service. Keep it running while using desktop actions.
