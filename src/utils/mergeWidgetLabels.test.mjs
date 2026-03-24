/**
 * `npm run test:labels` runs this file plus `localeLabelCompleteness.test.mjs`.
 * Covers mergeWidgetLabels() behavior (API vs locale vs options).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { defaultLabels } from "../constants/defaultLabels.mjs";
import {
  isRemoteEmpty,
  localesMatch,
  mergeWidgetLabels,
  normalizeBotLanguage,
  pickBrowserLanguageTag,
  resolveBrowserLocale,
  resolveExplicitLocaleString,
  toBaseLanguageCode,
} from "./mergeWidgetLabels.mjs";
import { LOCALE_PACK_CODES } from "./supportedWidgetLocales.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Keys from `localeImports.js` (parsed from source; file is CJS to Node when loaded from .mjs tests).
 * Matches lines like `  af: () => import(`.
 */
function readLocaleImporterKeysSorted() {
  const src = fs.readFileSync(path.join(__dirname, "localeImports.js"), "utf8");
  const keys = [];
  const re = /^  ([a-z]{2}): \(\) => import\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    keys.push(m[1]);
  }
  return keys.sort();
}

const localeFilesOnDisk = fs
  .readdirSync(path.join(__dirname, "../locales"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.basename(f, ".js"))
  .sort();

const localeFileCount = localeFilesOnDisk.length;
const packCodesSorted = [...LOCALE_PACK_CODES].sort();
const importerKeysSorted = readLocaleImporterKeysSorted();

test("supportedWidgetLocales.mjs matches src/locales/*.js", () => {
  assert.equal(
    LOCALE_PACK_CODES.length,
    localeFileCount,
    `LOCALE_PACK_CODES.length (${LOCALE_PACK_CODES.length}) must equal src/locales/*.js count (${localeFileCount})`
  );
  assert.deepEqual(localeFilesOnDisk, packCodesSorted);
});

test("localeImports.js LOCALE_IMPORTERS matches disk and LOCALE_PACK_CODES", () => {
  assert.equal(
    importerKeysSorted.length,
    localeFileCount,
    `LOCALE_IMPORTERS key count (${importerKeysSorted.length}) must equal src/locales/*.js count (${localeFileCount})`
  );
  assert.equal(
    LOCALE_PACK_CODES.length,
    importerKeysSorted.length,
    `LOCALE_PACK_CODES.length (${LOCALE_PACK_CODES.length}) must equal LOCALE_IMPORTERS key count (${importerKeysSorted.length})`
  );
  assert.deepEqual(
    importerKeysSorted,
    packCodesSorted,
    "LOCALE_IMPORTERS keys must be the same set as LOCALE_PACK_CODES (and locale files on disk)"
  );
  const src = fs.readFileSync(path.join(__dirname, "localeImports.js"), "utf8");
  for (const code of LOCALE_PACK_CODES) {
    assert.ok(
      src.includes(`${code}:`),
      `localeImports.js missing importer entry for "${code}"`
    );
  }
});

test("toBaseLanguageCode", () => {
  assert.equal(toBaseLanguageCode("es-MX"), "es");
  assert.equal(toBaseLanguageCode("  ja-JP "), "ja");
  assert.equal(toBaseLanguageCode("invalid"), null);
});

test("resolveBrowserLocale uses list", () => {
  assert.equal(resolveBrowserLocale(["pt-BR", "en"]), "pt");
  assert.equal(resolveBrowserLocale([]), "en");
});

test("resolveBrowserLocale skips unsupported until a shipped locale", () => {
  assert.equal(resolveBrowserLocale(["zu", "fr-FR"]), "fr");
  assert.equal(resolveBrowserLocale(["zu", "xh"]), "en");
});

test("pickBrowserLanguageTag preserves first matching tag", () => {
  assert.equal(pickBrowserLanguageTag(["zu", "fr-CA", "en"], "fr"), "fr-CA");
  assert.equal(pickBrowserLanguageTag(["de"], "en"), "en");
});

test("resolveExplicitLocaleString clamps unknown codes to en", () => {
  assert.equal(resolveExplicitLocaleString("de"), "de");
  assert.equal(resolveExplicitLocaleString("zu"), "en");
  assert.equal(resolveExplicitLocaleString("not-a-locale"), null);
});

test("normalizeBotLanguage", () => {
  assert.equal(normalizeBotLanguage("EN"), "en");
  assert.equal(normalizeBotLanguage(null), null);
});

test("localesMatch", () => {
  assert.equal(localesMatch("es", "es"), true);
  assert.equal(localesMatch("en", "es"), false);
  assert.equal(localesMatch(null, "es"), false);
});

test("merge: options always win", () => {
  const out = mergeWidgetLabels({
    defaultLabels,
    localeLabels: { firstMessage: "Hola" },
    remoteLabels: { firstMessage: "API" },
    optionsLabels: { firstMessage: "Opt" },
    botLanguage: "es",
    browserLocale: "es",
  });
  assert.equal(out.firstMessage, "Opt");
});

test("merge: lang match uses remote when non-empty", () => {
  const out = mergeWidgetLabels({
    defaultLabels,
    localeLabels: { firstMessage: "Local ES" },
    remoteLabels: { firstMessage: "From API" },
    botLanguage: "es",
    browserLocale: "es",
  });
  assert.equal(out.firstMessage, "From API");
});

test("merge: lang match empty remote falls back to base", () => {
  const out = mergeWidgetLabels({
    defaultLabels,
    localeLabels: { firstMessage: "Local ES" },
    remoteLabels: { firstMessage: "   " },
    botLanguage: "es",
    browserLocale: "es",
  });
  assert.equal(out.firstMessage, "Local ES");
});

test("merge: lang mismatch ignores remote firstMessage", () => {
  const out = mergeWidgetLabels({
    defaultLabels,
    localeLabels: { firstMessage: "Local ES" },
    remoteLabels: { firstMessage: "English API" },
    botLanguage: "en",
    browserLocale: "es",
  });
  assert.equal(out.firstMessage, "Local ES");
});

test("merge: pass-through footerMessage uses API on mismatch", () => {
  const out = mergeWidgetLabels({
    defaultLabels,
    localeLabels: { footerMessage: "" },
    remoteLabels: { footerMessage: "Legal **EN**" },
    botLanguage: "en",
    browserLocale: "es",
  });
  assert.equal(out.footerMessage, "Legal **EN**");
});

test("isRemoteEmpty", () => {
  assert.equal(isRemoteEmpty(undefined), true);
  assert.equal(isRemoteEmpty("  "), true);
  assert.equal(isRemoteEmpty("x"), false);
});
