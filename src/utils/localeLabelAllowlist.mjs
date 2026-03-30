/**
 * Allowlists for locale label completeness tests (see localeLabelCompleteness.test.mjs).
 * Per-locale keys that may legitimately match English (same spelling in both languages).
 */

/**
 * @type {Record<string, string[]>}
 */
export const LOCALE_LABEL_SAME_AS_ENGLISH_OK = {
  /** Cognate identical to English */
  af: ["stripeIntervalWeek"],
  ca: ["feedbackNo"],
  es: ["feedbackNo"],
  it: ["feedbackNo"],
  id: ["stripeItem"],
  ms: ["stripeItem"],
  pt: ["stripeItem"],
  /** Cognates / identical UI terms */
  fr: ["sources", "stripeDate"],
  nl: ["stripeIntervalWeek"],
};

/**
 * @param {string} localeCode
 * @param {string} key
 * @returns {boolean}
 */
export function isSameAsEnglishAllowed(localeCode, key) {
  const list = LOCALE_LABEL_SAME_AS_ENGLISH_OK[localeCode];
  return Array.isArray(list) && list.includes(key);
}
