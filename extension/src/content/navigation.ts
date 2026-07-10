import { watchVideoId } from './page';

/** Watches YouTube SPA navigation. Calls onVideo with the current watch videoId
 *  (or null off watch pages), immediately and on every navigation. Dedupes. */
export function watchNavigation(onVideo: (videoId: string | null) => void): () => void {
  let last: string | null | undefined;

  const check = () => {
    const id = watchVideoId(window.location);
    if (id !== last) {
      last = id;
      onVideo(id);
    }
  };

  check();
  document.addEventListener('yt-navigate-finish', check);
  const poll = setInterval(check, 1000); // fallback: yt-navigate-finish is undocumented

  return () => {
    document.removeEventListener('yt-navigate-finish', check);
    clearInterval(poll);
  };
}
