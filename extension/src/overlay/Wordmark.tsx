/** The tabIt wordmark is outlined Fraunces glyph paths (see docs/design/assets/wordmark.svg),
 *  not live text — the content script can't load the Fraunces webfont, so the brand asset
 *  is shipped as a packaged extension resource instead of recreated in CSS. */
export function Wordmark({ className }: { className: string }) {
  return <img src={chrome.runtime.getURL('icons/wordmark.svg')} alt="tabIt" className={className} />;
}
