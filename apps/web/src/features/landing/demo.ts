/**
 * The demo video on the welcome page. Paste a YouTube link here (any form: watch, youtu.be, shorts).
 * Empty, the video block is hidden and "see how it works" scrolls to the steps instead.
 */
export const DEMO_VIDEO_URL = "";

const VIDEO_ID = /^[\w-]{11}$/;

/** The privacy-enhanced YouTube player address for a YouTube link, or null for anything else. */
export function youtubeEmbed(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com")
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname)?.[1] ?? null);
  return id && VIDEO_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
