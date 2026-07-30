import assert from "node:assert/strict";
import test from "node:test";

import { getSourceInlineMedia, sourceMediaInternals } from "./sourceMedia.mjs";

test("builds a media player from signed media URLs with time fragments", () => {
  const media = getSourceInlineMedia({
    type: "media",
    title: "Demo video",
    url: "https://storage.googleapis.com/test/media.mp4?X-Goog-Signature=abc#t=10.6,47.98",
  });

  assert.equal(media.kind, "video");
  assert.equal(media.start, 10.6);
  assert.equal(
    media.src,
    "https://storage.googleapis.com/test/media.mp4?X-Goog-Signature=abc"
  );
});

test("infers audio media from file extension", () => {
  const media = getSourceInlineMedia({
    type: "media",
    title: "Podcast",
    url: "https://storage.googleapis.com/test/podcast.mp3#t=12.3",
  });

  assert.equal(media.kind, "audio");
  assert.equal(media.start, 12.3);
});

test("builds a timestamped YouTube embed URL", () => {
  const media = getSourceInlineMedia({
    type: "youtube",
    title: "Launch video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s",
  });

  assert.equal(media.kind, "youtube");
  assert.equal(media.start, 83);
  assert.equal(
    media.src,
    "https://www.youtube.com/embed/dQw4w9WgXcQ?start=83&autoplay=1&rel=0"
  );
});

test("parses colon timestamps from metadata fallbacks", () => {
  const media = getSourceInlineMedia({
    type: "media",
    url: "https://example.com/video.webm",
    start_time: "01:02:03.5",
  });

  assert.equal(media.start, 3723.5);
});

test("ignores non-media source types", () => {
  assert.equal(
    getSourceInlineMedia({
      type: "url",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s",
    }),
    null
  );
});

test("ignores media sources that are original/HTML URLs without a playable file", () => {
  assert.equal(
    getSourceInlineMedia({
      type: "media",
      title: "Training recording",
      url: "https://example.com/recordings/training-session",
    }),
    null
  );
  assert.equal(
    getSourceInlineMedia({
      type: "media",
      title: "Training recording",
      url: "https://example.com/recordings/training-session.html",
    }),
    null
  );
});

test("allows media playback from explicit mime when the URL has no extension", () => {
  const media = getSourceInlineMedia({
    type: "media",
    url: "https://storage.googleapis.com/test/signed-object?X-Goog-Signature=abc#t=4",
    mimeType: "audio/mpeg",
  });

  assert.equal(media.kind, "audio");
  assert.equal(media.start, 4);
});

test("extracts YouTube ids from short URLs", () => {
  assert.equal(
    sourceMediaInternals.getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=83"),
    "dQw4w9WgXcQ"
  );
});
