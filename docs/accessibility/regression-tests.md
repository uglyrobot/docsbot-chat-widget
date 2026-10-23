# Accessibility Regression Tests

## Added coverage

- `eslint.config.mjs`
  - Applies `eslint-plugin-jsx-a11y` rules to widget source files
- `playwright.config.mjs`
  - Local static server + Playwright setup for accessibility scenarios
- `tests/accessibility/widget.a11y.spec.mjs`
  - Dedicated local harness with explicit copy, upload, escalation, and lead-form settings; independent of the interactive demo's PII-model download and voice preview options
  - Floating widget keyboard open/close and axe scan
  - Chat flow with source link, copy button, upload button, and axe scan
  - Lead-capture flow with keyboard activation, native invalid-submit focus, error descriptions, and error clearing after correction
  - Embedded mode axe scan
- `tests/accessibility/helpers/widgetMocks.mjs`
  - Stable mocked widget config and SSE responses for deterministic testing

## Commands

- `npm run a11y:lint`
- `npm run a11y:axe`
- `npm run a11y`
- `npx playwright test` (all browser regressions, including reset, images, layout, runtime options, and mocked voice)

The voice-disabled layout scenario explicitly disables both recorded and live voice and waits for the upload control's position transition before measuring spacing. Voice tests echo the request conversation ID as the server does, use a relative action-row locator, and mount the direct-escalation scenario without lead capture; separate voice tests exercise lead capture.
The direct-escalation mock waits for its data channel to open before injecting voice events, so No/Yes interactions exercise a ready session.

## Latest result

- `npm run a11y`: passed
- `npm run a11y:axe`: 4 passing scenarios
- JSON artifact: `artifacts/accessibility/playwright-axe-report.json`

## Coverage gaps

- No regression coverage yet for scheduler embeds
- No regression coverage yet for Stripe billing response cards
- No true screen-reader regression coverage
