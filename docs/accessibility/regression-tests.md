# Accessibility Regression Tests

## Added coverage

- `eslint.config.mjs`
  - Applies `eslint-plugin-jsx-a11y` rules to widget source files
- `playwright.config.mjs`
  - Local static server + Playwright setup for accessibility scenarios
- `tests/accessibility/widget.a11y.spec.mjs`
  - Floating widget keyboard open/close and axe scan
  - Chat flow with source link, copy button, upload button, and axe scan
  - Lead-capture flow with labels and invalid state assertions
  - Embedded mode axe scan
- `tests/accessibility/helpers/widgetMocks.mjs`
  - Stable mocked widget config and SSE responses for deterministic testing

## Commands

- `npm run a11y:lint`
- `npm run a11y:axe`
- `npm run a11y`

## Latest result

- `npm run a11y`: passed
- `npm run a11y:axe`: 4 passing scenarios
- JSON artifact: `artifacts/accessibility/playwright-axe-report.json`

## Coverage gaps

- No regression coverage yet for scheduler embeds
- No regression coverage yet for Stripe billing response cards
- No true screen-reader regression coverage
