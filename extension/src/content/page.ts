const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Ordered insertion candidates for the below-player slot. First match wins.
 *  This list is the single point of maintenance when YouTube's DOM changes. */
export const INSERTION_SELECTORS = ['#below', 'ytd-watch-metadata', '#primary-inner'];

export function watchVideoId(loc: { pathname: string; search: string }): string | null {
  if (loc.pathname !== '/watch') return null;
  const v = new URLSearchParams(loc.search).get('v');
  return v && VIDEO_ID.test(v) ? v : null;
}

export function isAdShowing(root: ParentNode): boolean {
  return root.querySelector('.html5-video-player.ad-showing') !== null;
}

export function findInsertionSlot(root: ParentNode): Element | null {
  for (const sel of INSERTION_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
