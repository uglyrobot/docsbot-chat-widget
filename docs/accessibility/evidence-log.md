# Accessibility Evidence Log

Scope note: Evidence below supports conclusions for the widget/embed package only.

| Topic | Evidence | Conclusion |
| --- | --- | --- |
| Widget architecture | `src/components/embeddableWidget/EmbeddableWidget.jsx`, `src/components/app/App.jsx`, `src/components/chatbot/Chatbot.jsx` | Repo is a React/webpack widget package, not the full DocsBot product |
| Locale merge and existing test baseline | `src/constants/defaultLabels.mjs`, `src/utils/mergeWidgetLabels.mjs`, `npm run test:labels` | Locale infrastructure is present and remained passing after changes |
| Semantic launcher fix | `src/components/floatingButton/FloatingButton.jsx` | Launcher now uses a semantic button with accessible name and expanded state |
| Focus return on close | `src/components/app/App.jsx` | Closing the floating widget restores focus to the launcher |
| Keyboard close behavior | `src/components/chatbot/Chatbot.jsx` | Escape closes the floating widget |
| Chat input labeling | `src/components/chatbot/Chatbot.jsx` | Textarea now has programmatic label wiring |
| Transcript/status semantics | `src/components/chatbot/Chatbot.jsx`, `src/components/botChatMessage/BotChatMessage.jsx` | Chat updates expose log/status/alert semantics more clearly |
| Lead-form invalid state and error association | `src/components/leadCollectMessage/LeadCollectMessage.jsx` | Required fields expose `aria-invalid` and `aria-describedby` after interaction |
| Visible focus | `src/assets/scss/_components/_floating-button.scss`, `_header.scss`, `_input.scss`, `_submit-button.scss`, `_scroll-button.scss`, `_utils/_helpers/_bubble-button.scss` | Key controls now have explicit visible focus styling |
| Reduced motion | `src/assets/scss/chatbot.scss` | Loader animation is suppressed when reduced-motion is requested |
| Demo harness zoom | `public/index.html` | Demo harness no longer prevents zoom |
| Automated audit output | `artifacts/accessibility/playwright-axe-report.json` | Four widget flows passed with zero critical axe violations in mocked test scenarios |
| Regression coverage | `tests/accessibility/widget.a11y.spec.mjs` | Keyboard, source-link, lead-form, and embedded-mode flows are now covered |
| Direct screen-reader audit findings | VoiceOver-driven manual testing during remediation, reflected in follow-up fixes to `BotChatMessage.jsx`, `BotAvatar.jsx`, `FloatingButton.jsx`, and `Chatbot.jsx` | Duplicate announcements, decorative avatar exposure, and transcript/speaker-context issues were observed directly and used to guide remediations |

## Command evidence

- `npm run test:labels`: passed
- `npm run build`: passed
- `npm run a11y:lint`: passed
- `npm run a11y:axe`: passed
- `npm run a11y`: passed

## Manual AT evidence

- Direct VoiceOver testing identified:
  - duplicate speech for copy/support/feedback controls
  - bot avatar being announced when decorative
  - insufficient speaker context in transcript reading order
  - fragile live-announcement behavior during iterative follow-up responses
- The implementation was subsequently simplified back toward standard `role="log"` + `role="status"` semantics after custom live-region strategies produced inconsistent speech output.

## Screenshots and media

- No standalone curated screenshots were retained in `artifacts/accessibility/` during the final passing run.
- Machine-readable evidence retained:
  - `artifacts/accessibility/playwright-axe-report.json`
