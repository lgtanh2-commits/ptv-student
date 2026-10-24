import { describe, expect, it } from "vitest";
import { youtubeEmbed } from "./demo";

const PLAYER = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("youtubeEmbed", () => {
  it("turns every kind of YouTube link into the privacy player", () => {
    expect(youtubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(PLAYER);
    expect(youtubeEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toBe(PLAYER);
    expect(youtubeEmbed("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(PLAYER);
    expect(youtubeEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(PLAYER);
    expect(youtubeEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(PLAYER);
    expect(youtubeEmbed("  https://youtu.be/dQw4w9WgXcQ  ")).toBe(PLAYER);
  });

  it("gives null for no link, another site or a broken id", () => {
    expect(youtubeEmbed("")).toBeNull();
    expect(youtubeEmbed("not a link")).toBeNull();
    expect(youtubeEmbed("https://vimeo.com/123456")).toBeNull();
    expect(youtubeEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeEmbed("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload")).toBeNull();
  });
});
