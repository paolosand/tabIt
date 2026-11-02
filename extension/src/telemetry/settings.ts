const SHARE_KEY = 'shareUsage';
const INSTALL_KEY = 'installId';

/** Whether the user opted in to sharing usage data. Off by default, and off if storage fails. */
export async function getShareUsage(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get(SHARE_KEY);
    return got[SHARE_KEY] === true;
  } catch {
    return false;
  }
}

export async function setShareUsage(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [SHARE_KEY]: on });
}

/** Anonymous per-install ID, created lazily on first use. */
export async function getInstallId(): Promise<string> {
  const got = await chrome.storage.local.get(INSTALL_KEY);
  const existing = got[INSTALL_KEY];
  if (typeof existing === 'string' && existing) return existing;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_KEY]: id });
  return id;
}
