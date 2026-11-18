export const TOKEN_KEY = 'nova-desktop-bridge-token';

export function getDesktopBridgeToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export async function runDesktopApp(app: string): Promise<void> {
  const token = getDesktopBridgeToken();
  if (!token) throw new Error('Desktop companion pair nahi hai. Desktop Bridge panel mein pairing token enter karo.');
  const response = await fetch('http://127.0.0.1:3210/v1/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ app }),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Desktop action failed.');
}

export async function openChromeNewTab(url?: string): Promise<void> {
  const token = getDesktopBridgeToken();
  if (!token) throw new Error('Desktop companion pair nahi hai. Desktop Bridge panel mein pairing token enter karo.');
  const response = await fetch('http://127.0.0.1:3210/v1/chrome/new-tab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(url ? { url } : {}),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Chrome new tab action failed.');
}

export async function searchInChrome(query: string): Promise<void> {
  const token = getDesktopBridgeToken();
  if (!token) throw new Error('Desktop companion pair nahi hai. Desktop Bridge panel mein pairing token enter karo.');
  const response = await fetch('http://127.0.0.1:3210/v1/chrome/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Chrome search failed.');
}
