# Automated Accessibility Audit

Scope note: Automated testing covered the widget/embed package only.

## Tooling used

- `npm run a11y:lint`
  - `eslint` 9
  - `eslint-plugin-jsx-a11y`
- `npm run a11y:axe`
  - `@playwright/test`
  - `@axe-core/playwright`
  - machine-readable output: `artifacts/accessibility/playwright-axe-report.json`
- Supporting verification:
  - `npm run build`
  - `npm run test:labels`

## Automated flows exercised

1. Floating widget keyboard open and close flow
2. Floating widget send-message flow with mocked source link, copy button, upload button
3. Lead-capture / escalation flow with required-field validation checks
4. Embedded widget open state

## Result summary

- `npm run a11y:lint`: passed
- `npm run a11y:axe`: passed
- Playwright/axe scenarios passed: 4
- Critical axe violations in evaluated flows after remediation: 0

## Raw evidence

- JSON report: `artifacts/accessibility/playwright-axe-report.json`
- Test coverage file: `tests/accessibility/widget.a11y.spec.mjs`
- Mocked remote config/SSE fixtures: `tests/accessibility/helpers/widgetMocks.mjs`

## Notable issues found during automated setup and remediation

- Floating launcher and mobile close controls were implemented as anchors styled like buttons.
- The chat input had no programmatic label.
- Several icon-only controls lacked reliable accessible names.
- Visible focus styles were suppressed in several components.
- The embedded harness exposed a critical image-alt issue when `botName` was absent from mocked config.
- The demo harness disabled zoom with `maximum-scale=1.0, user-scalable=0`.

## False positives / limitations

- No formal false positives were retained in the final passing run.
- Automated checks did not validate real assistive technology output.
- Automated checks used mocked widget configuration and mocked chat-agent SSE responses to keep flows deterministic.
- Color contrast and non-text contrast were not exhaustively evaluated across arbitrary integrator-supplied brand colors.
