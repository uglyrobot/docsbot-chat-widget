# DocsBot Chat Widget Accessibility Conformance Report Draft

Draft status: Internal technical draft, dated 2026-04-14.

## Summary

This report summarizes accessibility findings for the DocsBot Chat Widget / Embeddable Chat Widget code contained in this repository. The review included code inspection, automated linting, Playwright + axe testing, keyboard-centered browser validation, and limited direct screen-reader testing during remediation. The draft is intentionally conservative and does not make legal compliance claims.

## Evaluated scope

- Floating launcher and floating chat widget
- Embedded chat mode
- Shared transcript, message, source-link, and lead-capture components
- Local demo harness used to exercise the widget

Excluded:

- DocsBot dashboard
- Authentication flows
- Settings/configuration screens outside this repo
- Knowledge base / content management UI

## Methods used

- Static analysis: `eslint-plugin-jsx-a11y`
- Automated browser checks: Playwright + axe-core
- Local build verification: webpack/Gulp build
- Locale integrity verification: existing label tests
- Manual engineering review of semantics, focus, forms, and dynamic status behavior
- Limited direct screen-reader testing focused on naming and announcement behavior in widget flows

## Environment

- macOS development environment
- Local Chromium through Playwright
- Mocked remote config and mocked SSE chat responses

## Current maturity assessment

- Keyboard support in the evaluated widget flows: good evidence
- Semantic labeling and focus visibility: improved materially in this pass
- Screen reader confidence: partial, because some real VoiceOver testing informed remediation, but a broader structured AT matrix has not yet been completed
- Procurement readiness: adequate for buyer diligence

## Key findings

### Improvements implemented

- Semantic buttons replaced anchor-as-button patterns
- Focus return and Escape close behavior added for the floating widget
- Chat input programmatic label added
- Transcript semantics improved with `role="log"`
- Status and error semantics improved for agent activity/loading/error states
- Lead-form required-state/error association improved
- Focus visibility improved across core controls
- Demo harness zoom restriction removed

### Remaining gaps

- Some ARIA-only strings remain English-only by design
- Screen reader output for true streaming behavior is only partially validated
- Theme-driven contrast still needs broader verification
- Third-party embedded scheduler experiences remain only partially reviewed and are out of scope

## Conformance summary

- Strong confidence:
  - Keyboard access in key widget flows
  - Focus visibility for remediated controls
  - Basic transcript/input/source-link accessibility in tested flows
- Partial confidence:
  - Non-text alternatives and link purpose where upstream content quality varies
  - Error handling across all backend-driven states
  - Reflow/contrast across all host themes and embeddings
- Not yet verified:
  - Cross-AT behavior beyond the direct screen-reader testing already performed
  - Third-party embed behavior

## Related documents

- `docs/accessibility/wcag-2.1-aa-matrix.md`
- `docs/accessibility/DocsBot-VPAT-draft.md`
- `docs/accessibility/evidence-log.md`
