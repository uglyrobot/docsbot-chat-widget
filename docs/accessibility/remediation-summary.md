# Remediation Summary

Scope note: This summary applies only to the widget/embed code in this repository.

## Before / after summary

### Resolved in this pass

- Non-semantic launcher and close controls converted to buttons
- Widget close now restores focus to the launcher
- Floating widget supports Escape-to-close
- Chat input now has a programmatic label
- Transcript now exposes log semantics
- Agent activity/loading/error messaging has clearer status semantics
- Lead-capture validation now exposes invalid fields and associated error text
- Focus visibility was strengthened across core controls
- Demo harness zoom restriction removed

### Still open

- ARIA-only strings for some controls remain hardcoded English
- Only limited direct screen-reader validation has been performed so far
- Theme-driven color contrast is not fully verified for arbitrary integrator color choices
- Third-party embed flows remain only partially evaluated

### Deferred

- Locale-backed translations for ARIA-only strings
- Expanded scheduler and billing accessibility coverage
- Cross-browser and mobile manual validation

## Confidence by area

| Area | Confidence | Notes |
| --- | --- | --- |
| Floating launcher and open/close flow | Strong | Code fixes + keyboard test + axe pass |
| Chat input and transcript basics | Strong | Code fixes + keyboard test + axe pass |
| Source links and response controls | Partial | Mocked flow verified; live backend variability not covered |
| Lead-capture validation | Partial | Required state validated in mocked escalation flow |
| Embedded mode | Strong | Axe pass and structural verification |
| Screen reader behavior under real streaming | Partial | Direct VoiceOver testing was performed, but announcement behavior still needs broader structured validation |
| Third-party embeds | Not yet verified | Code review only |

## Prioritized remediation backlog

### High priority

1. Localize remaining ARIA-only strings used by upload/remove/scroll/status controls.
2. Expand the completed VoiceOver audit into a structured VoiceOver + NVDA validation pass on real streaming conversations.
3. Audit arbitrary theme-color combinations for contrast and non-text contrast.

### Medium priority

1. Add regression tests for scheduler embeds and Stripe billing cards.
2. Validate mobile zoom and reflow on representative host pages.
3. Add more explicit status messaging for upload/drag-drop interactions.

### Lower priority

1. Expand documentation around host-page responsibilities versus widget responsibilities.
2. Add optional product-level accessibility guidance for integrators embedding the widget.
