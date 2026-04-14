# Assistive Technology Testing

Scope note: Limited but real screen-reader testing was performed during remediation. This was not a full formal assistive-technology certification pass.

## Environment used

- Local developer environment plus direct screen-reader-driven widget testing
- VoiceOver-based manual testing during remediation of the floating widget flows
- Chromium via Playwright for browser automation and regression checks
- No structured NVDA or Narrator pass was completed in this repository-only review

## What was actually verified

- Keyboard-only behavior for key widget flows:
  - launcher focus, open, close
  - chat submission
  - source-link exposure
  - lead-form labeling and invalid state
  - embedded mode load
- Direct screen-reader observations during iterative widget testing, including:
  - duplicate announcements on copy/support/feedback controls
  - bot avatar being announced when it should be decorative
  - difficulty distinguishing user messages from assistant messages
  - announcement behavior for follow-up questions, status updates, and answer completion
- Automated DOM-level accessibility analysis with axe-core

## What was not verified

- Formal multi-browser / multi-screen-reader matrix testing
- NVDA + Firefox/Chrome
- Narrator + Edge
- Exhaustive spoken output validation for all streaming permutations and host-page embeddings
- Third-party scheduler embeds with assistive technology

## Current conclusion

- Keyboard accessibility has moderate evidence in the evaluated widget flows.
- Screen reader support has partial direct evidence from real VoiceOver-driven remediation testing plus code review and axe results.
- The strongest evidence is for naming, basic transcript semantics, and obvious duplicate-announcement issues that were found and corrected during testing.
- Live announcement behavior still requires broader structured validation across more than one AT/browser combination.

## Recommendation

- Expand the performed screen-reader audit into a more formal matrix before using these materials for higher-stakes university or public-sector procurement:
  - Deepen VoiceOver validation on a stable browser/OS combination
  - Add NVDA + Chrome or Firefox on Windows
  - Add Narrator + Edge if public-sector procurement is a target
