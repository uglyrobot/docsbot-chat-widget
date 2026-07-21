const MEDIA_SOURCE_TYPES = new Set(["media", "youtube"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "webm"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);

function normalizeSourceType(type) {
  return String(type || "").trim().toLowerCase().replace(/-/g, "_");
}

function parseTimestampValue(value) {
  if (value == null || value === "" || value === "None") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = raw.match(/^(\d+(?:\.\d+)?)s?$/i);
  if (numeric) return Math.max(0, Number(numeric[1]));

  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length > 1 && parts.length <= 3 && parts.every(Boolean)) {
    const numbers = parts.map(Number);
    if (numbers.every(Number.isFinite)) {
      return Math.max(
        0,
        numbers.reduce((total, part) => total * 60 + part, 0)
      );
    }
  }

  return null;
}

function parseTimestampFromUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return null;

  try {
    const url = new URL(urlString, "https://docsbot.invalid");
    const hashMatch = url.hash.match(/(?:^#|[&#])t=([^,&]+)(?:,([^&]+))?/i);
    const startFromHash = hashMatch ? parseTimestampValue(hashMatch[1]) : null;
    if (startFromHash != null) return startFromHash;

    for (const key of ["t", "start", "time_continue"]) {
      const value = url.searchParams.get(key);
      const parsed = parseTimestampValue(value);
      if (parsed != null) return parsed;
    }
  } catch {
    const fragmentMatch = urlString.match(/#t=([^,&]+)/i);
    const parsedFragment = fragmentMatch ? parseTimestampValue(fragmentMatch[1]) : null;
    if (parsedFragment != null) return parsedFragment;

    const queryMatch = urlString.match(/[?&](?:t|start|time_continue)=([^&#]+)/i);
    const parsedQuery = queryMatch ? parseTimestampValue(queryMatch[1]) : null;
    if (parsedQuery != null) return parsedQuery;
  }

  return null;
}

function parseTimestampFromSource(source) {
  const fromUrl = parseTimestampFromUrl(source?.url);
  if (fromUrl != null) return fromUrl;

  for (const key of [
    "start",
    "startTime",
    "start_time",
    "timestamp",
    "time",
    "seconds",
  ]) {
    const parsed = parseTimestampValue(source?.[key]);
    if (parsed != null) return parsed;
  }

  return 0;
}

function getYouTubeVideoId(urlString) {
  if (!urlString || typeof urlString !== "string") return null;

  try {
    const url = new URL(urlString);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (hostname.endsWith("youtube.com")) {
      if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/").filter(Boolean)[1] || null;
      }

      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}

function withoutHash(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = "";
    return url.toString();
  } catch {
    return urlString;
  }
}

function getExtensionFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const filename = url.pathname.split("/").pop() || "";
    const match = filename.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    const path = String(urlString || "").split(/[?#]/)[0];
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  }
}

function inferMediaKind(source) {
  const explicitKind = normalizeSourceType(source?.mediaType || source?.mimeType || source?.contentType);
  if (explicitKind.startsWith("audio/") || explicitKind === "audio") return "audio";
  if (explicitKind.startsWith("video/") || explicitKind === "video") return "video";

  // Only treat URLs with a recognized media file extension as playable.
  // When source downloads are disabled the API returns the original page URL
  // (often HTML) without a CDN media object or timestamp fragment — those must
  // fall back to a normal external link, even if type is still "media".
  const extension = getExtensionFromUrl(source?.url || source?.file);
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";

  return null;
}

export function getSourceInlineMedia(source) {
  const type = normalizeSourceType(source?.type);
  if (!MEDIA_SOURCE_TYPES.has(type) || !source?.url) return null;

  const start = parseTimestampFromSource(source);
  const youtubeVideoId = type === "youtube" ? getYouTubeVideoId(source.url) : null;

  if (youtubeVideoId) {
    return {
      kind: "youtube",
      start,
      src: `https://www.youtube.com/embed/${encodeURIComponent(youtubeVideoId)}?start=${Math.floor(start)}&autoplay=1&rel=0`,
    };
  }

  if (type !== "media") return null;

  const kind = inferMediaKind(source);
  if (!kind) return null;

  return {
    kind,
    start,
    src: withoutHash(source.url),
  };
}

export const sourceMediaInternals = {
  parseTimestampValue,
  parseTimestampFromUrl,
  getYouTubeVideoId,
  inferMediaKind,
};
