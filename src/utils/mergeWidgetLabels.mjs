import { defaultLabels as bundledDefaultLabels } from "../constants/defaultLabels.mjs";
import { SUPPORTED_WIDGET_LANGUAGE_CODES } from "./supportedWidgetLocales.mjs";

/** Keys where locale packs intentionally omit copy; API non-empty always wins. */
export const LABEL_PASS_THROUGH_KEYS = Object.freeze(["footerMessage"]);

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function isRemoteEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v !== "string") return false;
  return v.trim() === "";
}

/**
 * @param {string} [tag]
 * @returns {string | null} lowercase 2-char or null
 */
export function toBaseLanguageCode(tag) {
  if (typeof tag !== "string" || !tag.trim()) return null;
  const t = tag.trim().toLowerCase();
  const base = t.split(/[-_]/)[0];
  if (base.length === 2 && /^[a-z]{2}$/.test(base)) return base;
  return null;
}

/**
 * Normalize browser preference list (navigator.languages or legacy navigator.language).
 * @param {string[]} [preferenceList]
 * @returns {string[]}
 */
export function normalizeLanguagePreferenceList(preferenceList) {
  if (Array.isArray(preferenceList) && preferenceList.length) {
    return preferenceList;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return [navigator.language];
  }
  return ["en"];
}

/**
 * First BCP 47-ish tag in the list whose base language matches `resolvedBaseCode`.
 * @param {string[]} [preferenceList]
 * @param {string} resolvedBaseCode — lowercase 2-char
 * @returns {string}
 */
export function pickBrowserLanguageTag(preferenceList, resolvedBaseCode) {
  const list = normalizeLanguagePreferenceList(preferenceList);
  for (const raw of list) {
    if (toBaseLanguageCode(raw) === resolvedBaseCode) {
      return typeof raw === "string" ? raw.trim() : resolvedBaseCode;
    }
  }
  return resolvedBaseCode;
}

/**
 * First valid BCP-47-ish tag from preferences, without clamping to shipped widget locale packs.
 * Use for API request language (e.g. agent default_language), not for choosing a UI locale module.
 * @param {string[]} [preferenceList]
 * @returns {string}
 */
export function pickPrimaryBrowserLanguageTag(preferenceList) {
  const list = normalizeLanguagePreferenceList(preferenceList);
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (toBaseLanguageCode(t)) return t;
  }
  return "en";
}

/**
 * Language tag for backend/agent requests: embed `locale` when set (non-auto), else primary browser tag.
 * Unlike {@link resolveBrowserLocale}, does not fall back to supported UI packs only.
 * @param {string[]} [preferenceList]
 * @param {{ locale?: string | null }} [options]
 * @returns {string}
 */
export function resolveEffectiveRequestLanguageTag(preferenceList, options) {
  const mode = options?.locale;
  if (typeof mode === "string" && mode.trim() && mode !== "auto") {
    const t = mode.trim();
    if (toBaseLanguageCode(t)) return t;
  }
  return pickPrimaryBrowserLanguageTag(preferenceList);
}

/**
 * @param {string[]} [preferenceList] e.g. navigator.languages
 * @param {ReadonlySet<string> | string[]} [supportedCodes] defaults to shipped locale packs + en
 * @returns {string} 2-char code, default 'en'
 */
export function resolveBrowserLocale(
  preferenceList,
  supportedCodes = SUPPORTED_WIDGET_LANGUAGE_CODES
) {
  const supported =
    supportedCodes instanceof Set ? supportedCodes : new Set(supportedCodes);
  const list = normalizeLanguagePreferenceList(preferenceList);

  for (const raw of list) {
    const full = toBaseLanguageCode(raw);
    if (full && supported.has(full)) return full;
  }
  return "en";
}

/**
 * @param {string} mode — embed option `locale` when set to a concrete tag
 * @param {ReadonlySet<string> | string[]} [supportedCodes]
 * @returns {string | null} resolved 2-char, or null if not a valid language tag
 */
export function resolveExplicitLocaleString(
  mode,
  supportedCodes = SUPPORTED_WIDGET_LANGUAGE_CODES
) {
  if (typeof mode !== "string") return null;
  const c = toBaseLanguageCode(mode);
  if (!c) return null;
  const supported =
    supportedCodes instanceof Set ? supportedCodes : new Set(supportedCodes);
  return supported.has(c) ? c : "en";
}

/**
 * @param {unknown} apiLanguage
 * @returns {string | null}
 */
export function normalizeBotLanguage(apiLanguage) {
  if (typeof apiLanguage !== "string") return null;
  return toBaseLanguageCode(apiLanguage);
}

/**
 * @param {string | null} bot
 * @param {string} browser
 * @returns {boolean}
 */
export function localesMatch(bot, browser) {
  if (!bot || !browser) return false;
  return bot === browser;
}

/**
 * Strip undefined from options.labels (preserve explicit null / empty string).
 * @param {Record<string, unknown> | undefined} optionsLabels
 * @returns {Record<string, unknown>}
 */
export function pickDefinedOptionsLabels(optionsLabels) {
  if (!optionsLabels || typeof optionsLabels !== "object") return {};
  return Object.entries(optionsLabels).reduce((acc, [key, value]) => {
    if (value !== undefined) acc[key] = value;
    return acc;
  }, {});
}

/**
 * @param {object} params
 * @param {Record<string, string>} params.defaultLabels — bundled English
 * @param {Record<string, string>} params.localeLabels — lazy locale overrides (may be partial)
 * @param {Record<string, string> | undefined} params.remoteLabels — data.labels
 * @param {Record<string, unknown> | undefined} params.optionsLabels — embed options
 * @param {string | null} params.botLanguage — data.language (2-char)
 * @param {string} params.browserLocale — resolved browser 2-char
 * @param {readonly string[]} [params.passThroughKeys]
 * @returns {Record<string, string>}
 */
export function mergeWidgetLabels({
  defaultLabels: baseEn = bundledDefaultLabels,
  localeLabels = {},
  remoteLabels = {},
  optionsLabels,
  botLanguage,
  browserLocale,
  passThroughKeys = LABEL_PASS_THROUGH_KEYS,
}) {
  const pass = new Set(passThroughKeys);
  const base = { ...baseEn, ...localeLabels };
  const remote =
    remoteLabels && typeof remoteLabels === "object" ? remoteLabels : {};
  const match = localesMatch(botLanguage, browserLocale);

  const merged = { ...base };

  for (const key of Object.keys(remote)) {
    const rv = remote[key];
    if (pass.has(key)) {
      if (!isRemoteEmpty(rv)) merged[key] = rv;
      continue;
    }
    if (match) {
      if (!isRemoteEmpty(rv)) merged[key] = rv;
      continue;
    }
    // language mismatch: ignore remote localized strings (keep base)
  }

  const opts = pickDefinedOptionsLabels(optionsLabels);
  return { ...merged, ...opts };
}
