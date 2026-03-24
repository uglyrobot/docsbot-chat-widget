# Agent notes: locales

## Adding a language

1. **Pick a two-letter ISO 639-1 code** (lowercase), e.g. `ja`.
2. **Add** `src/locales/<code>.js` by copying an existing locale (e.g. `da.js`) and translating every entry under `labels`. Keep the same **keys** as in `src/constants/defaultLabels.mjs`; only values change. Set `name` (human-readable) and `isRTL: true` only for right-to-left languages.
3. **Register the chunk** in `src/utils/localeImports.js`: add one line to `LOCALE_IMPORTERS` with the same pattern as neighbors (`webpackChunkName: "locale-<code>"`).
4. **Add the same code** to `LOCALE_PACK_CODES` in `src/utils/supportedWidgetLocales.mjs` (keeps browser language fallback and `npm run test:labels` in sync).
5. If you introduce **new** user-facing strings for the whole widget, add them to `defaultLabels` in `defaultLabels.mjs` first, then add the key to **every** locale file (including English-driven fallbacks you care about).

## Testing

Run **`npm run test:labels`**. It checks merge logic for `mergeWidgetLabels`, that **`supportedWidgetLocales.mjs` matches `src/locales/*.js` and `localeImports.js`**, and **locale completeness**: for each `src/locales/*.js`, every non-empty English default must be present, non-empty, and **not** identical to English unless allowed.

## When the test complains about “still English”

Edit **`src/utils/localeLabelAllowlist.mjs`**: **`LOCALE_LABEL_SAME_AS_ENGLISH_OK`** lists, per locale, keys that may legitimately match English (same spelling in both languages, e.g. Spanish `feedbackNo`: “No”).

Prefer real translations over widening the allowlist when the mismatch is just unfinished work.

## Sanity check

After changes, run **`npm run build`** so webpack still compiles; locale files are imported only through `localeImports.js`.
