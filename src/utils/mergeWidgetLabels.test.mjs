import assert from "node:assert/strict";
import test from "node:test";
import { defaultLabels } from "../constants/defaultLabels.js";
import {
  isRemoteEmpty,
  localesMatch,
  mergeWidgetLabels,
  normalizeBotLanguage,
  resolveBrowserLocale,
  toBaseLanguageCode,
} from "./mergeWidgetLabels.js";

test("toBaseLanguageCode", () => {
  assert.equal(toBaseLanguageCode("es-MX"), "es");
  assert.equal(toBaseLanguageCode("  ja-JP "), "ja");
  assert.equal(toBaseLanguageCode("invalid"), null);
});

test("resolveBrowserLocale uses list", () => {
  assert.equal(resolveBrowserLocale(["pt-BR", "en"]), "pt");
  assert.equal(resolveBrowserLocale([]), "en");
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
