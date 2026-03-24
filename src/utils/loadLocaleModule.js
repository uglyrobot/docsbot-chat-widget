import { LOCALE_IMPORTERS } from "./localeImports";

/**
 * @param {string} code — lowercase 2-char (e.g. en, es, ja)
 * @returns {Promise<{ labels: Record<string, string>, isRTL: boolean, name?: string }>}
 */
export async function loadLocaleModule(code) {
  if (!code || code === "en") {
    return { labels: {}, isRTL: false, name: "English" };
  }
  const loader = LOCALE_IMPORTERS[code];
  if (!loader) {
    return { labels: {}, isRTL: false, name: code };
  }
  try {
    const mod = await loader();
    const d = mod.default || {};
    return {
      labels: d.labels && typeof d.labels === "object" ? d.labels : {},
      isRTL: Boolean(d.isRTL),
      name: typeof d.name === "string" ? d.name : code,
    };
  } catch (e) {
    console.warn(`DOCSBOT: Failed to load locale "${code}", falling back to English.`, e);
    return { labels: {}, isRTL: false, name: code };
  }
}
