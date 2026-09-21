import open from 'open';

/** True on servers/SSH/CI: never auto-open a browser there, just print the URL. */
export function isHeadless(): boolean {
  if (process.env.CI) return true;
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return true;
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return true;
  }
  return false;
}

export async function openBrowser(url: string): Promise<void> {
  if (isHeadless()) return;
  await open(url);
}
