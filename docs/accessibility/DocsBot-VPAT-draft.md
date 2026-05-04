# DocsBot Chat Widget VPAT Draft

Draft status: Internal technical draft prepared on 2026-04-14. This document is not a legal certification and does not represent third-party validation.

## Product information

- Product name: DocsBot Chat Widget / DocsBot Embeddable Chat Widget
- Evaluation date: 2026-04-14
- Scope of evaluation: Public floating widget, embedded widget mode, shared transcript/message/form controls, and local demo harness behavior in this repository
- Out of scope: DocsBot dashboard, authentication, admin/settings, and knowledge-base management experiences not present in this repository, embedded 3rd party UI elements

## Evaluation methods used

- Manual code review of core widget components and styles
- Automated static checks with `eslint-plugin-jsx-a11y`
- Automated browser checks with Playwright + axe-core against mocked widget/configuration flows
- Keyboard-focused interaction testing in local Chromium
- Limited direct screen-reader testing during remediation, including VoiceOver-driven checks of naming and announcement behavior

## Applicable standards and guidelines

- WCAG 2.1 Level A and AA

## Terms

- `Supports`: The evaluated widget flow appears to meet the criterion in reviewed scope with no known exception in that scope.
- `Partially Supports`: Some reviewed flows support the criterion, but known exceptions, incomplete evidence, or out-of-scope dependencies remain.
- `Does Not Support`: A clear failure exists in reviewed scope.
- `Not Applicable`: The criterion does not apply to this component scope.
- `Not Evaluated`: Evidence was insufficient to make a reliable determination.

## Environments tested

- Local Chromium via Playwright on macOS
- Local static build served from the repository
- Mocked remote widget configuration and mocked agent SSE responses

## Assumptions and exclusions

- This draft evaluates only the widget/embed package.
- Host-page accessibility remains partly the responsibility of the embedding site.
- Third-party embeds and a broader cross-AT validation matrix still require additional manual validation.

## Contact method

- Accessibility issues should be routed through the DocsBot support/contact process by emailing human@docsbot.ai.

## WCAG 2.1 AA report

| Criteria | Conformance level | Remarks and explanations |
| --- | --- | --- |
| 1.1.1 Non-text Content | Partially Supports | Core widget images and controls were improved, but third-party and upstream content require more manual validation. |
| 1.2.1 to 1.2.5 Time-based Media | Not Applicable | No prerecorded/live media workflows were present in evaluated scope. |
| 1.3.1 Info and Relationships | Supports | Form associations and transcript semantics were improved. |
| 1.3.2 Meaningful Sequence | Supports | Evaluated widget flows render in meaningful order. |
| 1.3.3 Sensory Characteristics | Supports | No sensory-only instructions were identified. |
| 1.3.4 Orientation | Supports | No orientation restriction observed. |
| 1.3.5 Identify Input Purpose | Partially Supports | Some schema-driven fields support autocomplete, but not all possible configurations were verified. |
| 1.4.1 Use of Color | Partially Supports | Default widget states are not color-only, but user choice theme variability remains a risk. |
| 1.4.2 Audio Control | Not Applicable | No autoplay audio. |
| 1.4.3 Contrast (Minimum) | Partially Supports | Default theme appears improved; arbitrary customer theme colors can override. |
| 1.4.4 Resize Text | Partially Supports | Demo zoom restriction was removed, but broader zoom testing is incomplete. |
| 1.4.5 Images of Text | Supports | No essential images of text identified. |
| 1.4.10 Reflow | Partially Supports | Widget is responsive, but complete reflow testing across host pages is incomplete. |
| 1.4.11 Non-text Contrast | Partially Supports | Focus indicators were strengthened; theme variability remains. |
| 1.4.12 Text Spacing | Not Evaluated | Not explicitly tested. |
| 1.4.13 Content on Hover or Focus | Supports | No complex hover/focus-only content identified in tested flows. |
| 2.1.1 Keyboard | Supports | Keyboard access passed in evaluated launcher, input, source-link, and escalation flows. |
| 2.1.2 No Keyboard Trap | Supports | No keyboard trap observed in evaluated flows. |
| 2.1.4 Character Key Shortcuts | Not Applicable | No such feature identified. |
| 2.2.1 Timing Adjustable | Supports | No timed interaction found in evaluated scope. |
| 2.2.2 Pause, Stop, Hide | Partially Supports | Dynamic chat updates exist. Limited direct screen-reader testing informed remediation, but broader validation for live streaming behavior remains outstanding. |
| 2.3.1 Three Flashes or Below Threshold | Supports | No flashing content identified. |
| 2.4.1 Bypass Blocks | Not Applicable | Component scope rather than full page/site scope. |
| 2.4.2 Page Titled | Not Applicable | Host page responsibility; demo page title exists. |
| 2.4.3 Focus Order | Supports | Focus order and focus return were verified in key flows. |
| 2.4.4 Link Purpose (In Context) | Partially Supports | Source-link purpose depends partly on upstream source metadata. |
| 2.4.5 Multiple Ways | Not Applicable | Not a full navigational site/application surface. |
| 2.4.6 Headings and Labels | Supports | Labels improved, host-page semantics limit certainty. |
| 2.4.7 Focus Visible | Supports | Focus indicators were added and verified for core controls. |
| 2.5.1 Pointer Gestures | Supports | No path-only complex gestures required. |
| 2.5.2 Pointer Cancellation | Supports | Standard button/input behavior observed. |
| 2.5.3 Label in Name | Partially Supports | Major controls have names, but some ARIA-only strings remain generic or English-only. |
| 2.5.4 Motion Actuation | Not Applicable | No motion-actuated feature identified. |
| 2.5.5 Target Size | Partially Supports | Core controls are usable, but exhaustive touch-target testing is incomplete. |
| 2.5.6 Concurrent Input Mechanisms | Supports | Keyboard and pointer use coexist in evaluated flows. |
| 3.1.1 Language of Page | Partially Supports | Widget root sets language, but host page remains out of component control. |
| 3.1.2 Language of Parts | Not Evaluated | Not explicitly tested. |
| 3.2.1 On Focus | Supports | No unexpected focus-triggered context changes found. |
| 3.2.2 On Input | Supports | Input behavior is predictable in evaluated flows; dynamic backend variation remains. |
| 3.2.3 Consistent Navigation | Not Applicable | Outside component scope. |
| 3.2.4 Consistent Identification | Supports | Similar controls are identified consistently in reviewed flows. |
| 3.3.1 Error Identification | Supports | Lead-form validation improved; other backend-driven errors were not exhaustively covered. |
| 3.3.2 Labels or Instructions | Supports | Core labeling improved. |
| 3.3.3 Error Suggestion | Supports | Required-field errors are present |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Not Applicable | Not a high-risk transactional workflow in evaluated scope. |
| 4.1.1 Parsing | Supports | No parsing issues observed in evaluated flows. |
| 4.1.2 Name, Role, Value | Partially Supports | High-impact controls were remediated, but third-party embeds and some remaining labels need more review. |
| 4.1.3 Status Messages | Partially Supports | Status semantics improved and limited direct screen-reader testing was performed, but streaming announcement behavior still needs broader structured validation. |

## Notes

- This draft should be paired with `docs/accessibility/wcag-2.1-aa-matrix.md` and `docs/accessibility/evidence-log.md` for procurement discussions.
- Stronger public-sector readiness would require expanding the performed screen-reader testing into a structured multi-AT pass and obtaining a third-party accessibility assessment.
