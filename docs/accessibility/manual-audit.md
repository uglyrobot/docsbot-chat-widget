# Manual Code-Level Accessibility Audit

Scope note: This is a manual code review of the widget/embed repository, not a full-product review.

## Confirmed issues found

| Criterion | Component | Issue | Status |
| --- | --- | --- | --- |
| 2.1.1, 4.1.2 | `FloatingButton.jsx`, `Chatbot.jsx` | Launcher and mobile close controls used anchor elements for button behavior | Resolved |
| 2.4.7 | Multiple SCSS files | Several controls removed default outlines without equivalent focus styling | Resolved |
| 3.3.2, 4.1.2 | `Chatbot.jsx` | Chat textarea relied on placeholder text only | Resolved |
| 4.1.2 | `BotChatMessage.jsx` | Feedback/support controls could expose emoji-only or icon-only content without stable accessible names | Resolved |
| 4.1.3 | `BotChatMessage.jsx` | Dynamic activity/loading/error updates lacked clearer status/alert semantics | Partially resolved |
| 3.3.1, 3.3.3 | `LeadCollectMessage.jsx` | Required lead-form fields did not consistently expose invalid state and associated errors after validation | Resolved |
| 2.5.3 | `Chatbot.jsx` | Upload/remove image controls were named, but names are still hardcoded English strings | Open |
| 1.4.4 | `public/index.html` | Demo harness disabled zoom | Resolved |

## Resolved issues

- Replaced anchor-as-button patterns with semantic `button` elements.
- Added `aria-expanded`, `aria-controls`, and dynamic accessible names to the launcher.
- Added programmatic label wiring to the chat textarea.
- Added focus return to the launcher when the floating widget closes.
- Added Escape-key close behavior for the floating widget.
- Added `role="log"` and transcript labeling to the message container.
- Added `role="status"` / `role="alert"` to agent activity, loading, and error surfaces.
- Added explicit button naming to feedback and support actions.
- Added `aria-invalid` and `aria-describedby` handling to schema-driven lead forms.
- Added visible focus indicators to launcher, reset button, input wrapper, submit button, upload/remove buttons, scroll button, and bubble buttons.
- Added reduced-motion fallback for the animated loader dots.

## Probable issues / areas needing further validation

- Screen reader testing was performed during remediation and identified multiple announcement/naming issues, but real streaming behavior still needs a more structured multi-AT validation pass.
- Third-party scheduler embeds were not audited end-to-end.
- Stripe billing response UI was reviewed in code but not exercised in browser tests.
- Arbitrary host-page CSS and integrator-supplied theme colors may affect contrast and reflow outside the demo harness.

## Remaining risks

- Some ARIA-only control names remain hardcoded English strings rather than locale-backed labels.
- The widget is a custom panel/region rather than a true dialog; procurement reviewers may ask for explicit rationale and evidence.
- Source-link accessibility depends partly on upstream source metadata quality.
- The demo page is only a harness; page-level WCAG criteria remain host-page responsibilities.

## Recommended fixes not completed in this pass

1. Add locale-backed strings for upload/remove/scroll/status helper text so non-English screen-reader output is consistent.
2. Expand the performed VoiceOver audit into a structured validation pass for true streaming output and error recovery.
3. Expand automated coverage to scheduler embeds and Stripe billing responses.
4. Add contrast checks for several representative custom brand colors.
