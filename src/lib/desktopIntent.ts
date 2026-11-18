import { openChromeNewTab, runDesktopApp, searchInChrome } from './desktopBridge';

export async function executeDesktopCommand(raw: string): Promise<{ reply: string; emotion: 'happy' } | null> {
  const command = raw.trim().toLowerCase().replace(/[!?.,]/g, ' ').replace(/\s+/g, ' ');
  const newTab = /^(?:(?:google )?chrome(?: (?:mein|ka|ke))? )?(?:new|naya) tab(?: (?:kholo|open(?: karo)?))?$/.test(command);
  if (newTab) {
    await openChromeNewTab();
    return { reply: 'Ji, Chrome mein naya tab khol diya hai.', emotion: 'happy' };
  }

  const search = command.match(/^(?:google|chrome)(?: (?:par|pe|mein))? (.+?) (?:search|dhundo|dhoondo)(?: karo)?$/);
  if (search) {
    await searchInChrome(search[1]);
    return { reply: `Ji, Chrome mein ${search[1]} search kar rahi hoon.`, emotion: 'happy' };
  }

  const siteCommand = command.match(/^(?:please )?(.+?) (?:kholo|open(?: karo)?)$/);
  if (siteCommand) {
    const site = siteCommand[1].replace(/^(?:google )?chrome (?:mein|par|pe) /, '').trim();
    const sites: Record<string, string> = {
      youtube: 'https://www.youtube.com', google: 'https://www.google.com',
      gmail: 'https://mail.google.com', facebook: 'https://www.facebook.com',
      whatsapp: 'https://web.whatsapp.com', github: 'https://github.com',
      chatgpt: 'https://chatgpt.com',
    };
    const url = sites[site] || (/^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/.test(site)
      ? (site.startsWith('http') ? site : `https://${site}`) : null);
    if (url) {
      await openChromeNewTab(url);
      return { reply: `Ji, ${site} Chrome mein khol diya hai.`, emotion: 'happy' };
    }
  }

  const app = raw.match(/^(?:please\s+)?(?:(?:open|launch)\s+)?(?:google\s+)?(chrome|edge|notepad|calculator)(?:\s+(?:kholo|open(?:\s+karo)?|launch(?:\s+karo)?))?$/i);
  if (app) {
    await runDesktopApp(app[1].toLowerCase());
    return { reply: `${app[1]} launch kar diya hai.`, emotion: 'happy' };
  }
  return null;
}
