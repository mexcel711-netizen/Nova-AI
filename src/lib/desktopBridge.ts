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
