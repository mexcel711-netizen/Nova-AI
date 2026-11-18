import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
    'Access-Control-Allow-Private-Network': 'true',
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

function getChromeExecutable() {
  if (process.platform !== 'win32') return 'google-chrome';
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return roots.flatMap((root) => [join(root, 'Google/Chrome/Application/chrome.exe'), join(root, 'Chromium/Application/chrome.exe')]).find(existsSync) || 'chrome.exe';
}
function launchChrome(args = []) {
  const child = spawn(getChromeExecutable(), args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}
function safeWebUrl(value) {
  const target = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Only safe HTTP/HTTPS web addresses are allowed.');
  return target.href;
}
function launchApp(app) {
  if (app === 'chrome') { launchChrome(); return; }
  if (app === 'explorer' || app === 'task-manager' || app === 'settings') {
    if (process.platform === 'win32') {
      const command = app === 'task-manager' ? 'taskmgr.exe' : 'explorer.exe';
      const args = app === 'settings' ? ['ms-settings:'] : [];
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); return;
    }
    if (app === 'settings') throw new Error('Settings shortcut is currently Windows-only.');
    const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [app === 'explorer' ? homedir() : 'htop'], { detached: true, stdio: 'ignore' }); child.unref(); return;
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const candidates = app === 'edge'
      ? roots.map((root) => join(root, 'Microsoft/Edge/Application/msedge.exe'))
      : app === 'notepad'
        ? [join(process.env.WINDIR || 'C:/Windows', 'System32/notepad.exe')]
        : app === 'calculator'
          ? [join(process.env.WINDIR || 'C:/Windows', 'System32/calc.exe')]
          : [];
    const executable = candidates.find(existsSync) || (app === 'edge' ? 'msedge.exe' : undefined);
    if (!executable) throw new Error('App not found on this Windows installation.');
    const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); return;
  }
  const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [app], { detached: true, stdio: 'ignore' }); child.unref();
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
    return send(res, 200, { ok: true, platform: process.platform, capabilities: ['chrome', 'chrome-new-tab', 'chrome-search', 'edge', 'notepad', 'calculator', 'explorer', 'task-manager', 'settings', 'known-folders', 'urdu-neural-tts'] }, origin);
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
      if (!['chrome', 'edge', 'notepad', 'calculator', 'explorer', 'task-manager', 'settings'].includes(app)) return send(res, 400, { error: 'This app is not on the safe launch allowlist.' }, origin);
      launchApp(app);
      return send(res, 200, { ok: true, action: 'launch', app }, origin);
    }
    if (url.pathname === '/v1/open-location') {
      const locations = {
        desktop: join(homedir(), 'Desktop'),
        downloads: join(homedir(), 'Downloads'),
        documents: join(homedir(), 'Documents'),
        pictures: join(homedir(), 'Pictures'),
        music: join(homedir(), 'Music'),
        videos: join(homedir(), 'Videos'),
        home: homedir(),
      };
      const location = String(body.location || '').toLowerCase();
      const target = locations[location];
      if (!target) return send(res, 400, { error: 'Folder is not on the safe allowlist.' }, origin);
      const child = spawn(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return send(res, 200, { ok: true, action: 'open-location', location }, origin);
    }
    if (url.pathname === '/v1/chrome/new-tab') {
      const target = body.url ? safeWebUrl(body.url) : 'chrome://newtab';
      launchChrome(['--new-tab', target]);
      return send(res, 200, { ok: true, action: 'chrome-new-tab', url: target }, origin);
    }
    if (url.pathname === '/v1/chrome/search') {
      const query = String(body.query || '').trim().slice(0, 300);
      if (!query) return send(res, 400, { error: 'Search query is required.' }, origin);
      const target = 'https://www.google.com/search?q=' + encodeURIComponent(query);
      launchChrome(['--new-tab', target]);
      return send(res, 200, { ok: true, action: 'chrome-search', url: target }, origin);
    }
    if (url.pathname === '/v1/open-url') {
      const target = safeWebUrl(body.url);
      if (process.platform === 'win32') launchChrome(['--new-tab', target]);
      else { const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }); child.unref(); }
      return send(res, 200, { ok: true, action: 'open-url', url: target }, origin);
    }
    if (url.pathname === '/v1/tts') {
      const text = String(body.text || '').trim();
      if (!text || text.length > 2500) return send(res, 400, { error: 'Text must be between 1 and 2500 characters.' }, origin);
      const voice = VOICES.has(body.voice) ? body.voice : (/^[\u0000-\u007f]*$/.test(text) ? 'en-US-JennyNeural' : 'ur-PK-UzmaNeural');
      const emotion = String(body.emotion || 'calm').toLowerCase();
      const prosody = {
        happy: { rate: '+5%', pitch: '+8Hz' }, excited: { rate: '+11%', pitch: '+12Hz' },
        sad: { rate: '-9%', pitch: '-7Hz' }, empathetic: { rate: '-4%', pitch: '+2Hz' },
        thoughtful: { rate: '-7%', pitch: '-3Hz' }, confident: { rate: '+2%', pitch: '+3Hz' },
        calm: { rate: '-2%', pitch: '+0Hz' }, angry: { rate: '+3%', pitch: '-2Hz' },
        surprised: { rate: '+8%', pitch: '+10Hz' },
      }[emotion] || { rate: '+0%', pitch: '+0Hz' };
      const tts = new UniversalEdgeTTS(text, voice, { ...prosody, volume: '+0%' });
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
