import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { defaultLabels } from "../constants/defaultLabels.mjs";
import { isSameAsEnglishAllowed } from "./localeLabelAllowlist.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../locales");

/**
 * @param {string} raw — contents of src/locales/*.js
 * @returns {{ labels: Record<string, string>, name?: string, isRTL?: boolean }}
 */
function parseLocaleModuleSource(raw) {
  const body = raw.replace(/^(?:\uFEFF?\/\/[^\n]*\n)+/, "");
  if (!body.includes("export default")) {
    throw new Error("expected export default");
  }
  const patched = body.replace(/\bexport\s+default\s+/, "globalThis.__DOCSBOT_L = ");
  const ctx = { globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(patched, ctx);
  const mod = ctx.globalThis.__DOCSBOT_L;
  if (!mod || typeof mod !== "object") {
    throw new Error("invalid locale module export");
  }
  return mod;
}

const requiredKeys = Object.entries(defaultLabels)
  .filter(([, en]) => typeof en === "string" && en.trim() !== "")
  .map(([k]) => k);

test("every locale pack has non-empty translations for required keys", () => {
  const files = readdirSync(localesDir).filter((n) => n.endsWith(".js"));
  assert.ok(files.length > 0, "no locale files in src/locales");

  for (const file of files) {
    const localeCode = path.basename(file, ".js");
    const abs = path.join(localesDir, file);
    const raw = readFileSync(abs, "utf8");
    let mod;
    assert.doesNotThrow(() => {
      mod = parseLocaleModuleSource(raw);
    }, `parse ${file}`);

    const labels = mod.labels && typeof mod.labels === "object" ? mod.labels : {};
    const problems = [];

    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(labels, key)) {
        problems.push(`${key}: missing`);
        continue;
      }
      const val = labels[key];
      if (typeof val !== "string" || val.trim() === "") {
        problems.push(`${key}: empty`);
        continue;
      }
      const en = defaultLabels[key];
      if (val === en && !isSameAsEnglishAllowed(localeCode, key)) {
        problems.push(`${key}: still English (${JSON.stringify(en)})`);
      }
    }

    assert.deepEqual(
      problems,
      [],
      `${localeCode}: ${problems.join("; ") || "ok"}`
    );
  }
});
