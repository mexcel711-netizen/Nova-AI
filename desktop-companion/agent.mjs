import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UniversalEdgeTTS } from 'edge-tts-universal';

const HOST = '127.0.0.1';
const PORT = Number(process.env.NOVA_BRIDGE_PORT || 3210);
const TOKEN = process.env.NOVA_BRIDGE_TOKEN || randomBytes(24).toString('hex');
const ALLOWED_ORIGINS = new Set([
  'https://nova-ai.mexcel711.workers.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const VOICES = new Set(['ur-PK-UzmaNeural', 'en-US-JennyNeural', 'en-GB-SoniaNeural']);

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin || 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function launchApp(app) {
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const candidates = app === 'chrome'
      ? roots.flatMap((root) => [join(root, 'Google/Chrome/Application/chrome.exe'), join(root, 'Chromium/Application/chrome.exe')])
      : app === 'edge'
        ? roots.flatMap((root) => [join(root, 'Microsoft/Edge/Application/msedge.exe')])
        : app === 'notepad'
          ? [join(process.env.WINDIR || 'C:/Windows', 'System32/notepad.exe')]
          : app === 'calculator'
            ? [join(process.env.WINDIR || 'C:/Windows', 'System32/calc.exe')]
            : [];
    const executable = candidates.find(existsSync);
    if (executable) {
      const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return;
    }
    if (app === 'chrome' || app === 'edge') {
      const child = spawn('cmd.exe', ['/c', 'start', '', app], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return;
    }
    throw new Error('App not found on this Windows installation.');
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const target = app === 'chrome' ? 'https://www.google.com/chrome/' : app === 'edge' ? 'https://www.microsoft.com/edge' : app;
  const child = spawn(command, [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'Origin not allowed' }, 'null');
    return send(res, 204, {}, origin);
  }
  if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'Origin not allowed' }, 'null');
  if (!authorized(req)) return send(res, 401, { error: 'Pairing token required' }, origin);

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/v1/health') {
    return send(res, 200, { ok: true, platform: process.platform, capabilities: ['chrome', 'edge', 'notepad', 'calculator', 'urdu-neural-tts'] }, origin);
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' }, origin);

  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > 12000) return send(res, 413, { error: 'Request too large' }, origin);
  }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'Invalid JSON' }, origin); }

  try {
    if (url.pathname === '/v1/launch') {
      const app = String(body.app || '').toLowerCase();
      if (!['chrome', 'edge', 'notepad', 'calculator'].includes(app)) return send(res, 400, { error: 'This app is not on the safe launch allowlist.' }, origin);
      launchApp(app);
      return send(res, 200, { ok: true, action: 'launch', app }, origin);
    }
    if (url.pathname === '/v1/open-url') {
      const target = new URL(String(body.url || ''));
      if (!['http:', 'https:'].includes(target.protocol) || /["'&|<>^%\n\r]/.test(target.href)) return send(res, 400, { error: 'Only safe HTTP/HTTPS URLs are allowed.' }, origin);
      if (process.platform === 'win32') {
        const child = spawn('cmd.exe', ['/c', 'start', '', target.href], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
      } else {
        const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target.href], { detached: true, stdio: 'ignore' });
        child.unref();
      }
      return send(res, 200, { ok: true, action: 'open-url', url: target.href }, origin);
    }
    if (url.pathname === '/v1/tts') {
      const text = String(body.text || '').trim();
      if (!text || text.length > 2500) return send(res, 400, { error: 'Text must be between 1 and 2500 characters.' }, origin);
      const voice = VOICES.has(body.voice) ? body.voice : (/^[\u0000-\u007f]*$/.test(text) ? 'en-US-JennyNeural' : 'ur-PK-UzmaNeural');
      const tts = new UniversalEdgeTTS(text, voice);
      const result = await tts.synthesize();
      const audioBase64 = Buffer.from(await result.audio.arrayBuffer()).toString('base64');
      return send(res, 200, { audioChunks: [{ audioBase64, mimeType: 'audio/mpeg' }], engine: 'microsoft-edge-neural', voice }, origin);
    }
    return send(res, 404, { error: 'Not found' }, origin);
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : 'Desktop action failed.' }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log('\nNOVA Desktop Companion');
  console.log(`Listening only on http://${HOST}:${PORT}`);
  console.log(`Pairing token: ${TOKEN}`);
  console.log('Enter this token in NOVA > Desktop Bridge. Keep it private. Press Ctrl+C to stop.\n');
});
