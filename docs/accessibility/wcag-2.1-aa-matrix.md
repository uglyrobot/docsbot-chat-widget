# WCAG 2.1 AA Matrix

Scope note: Ratings apply only to the DocsBot Chat Widget / Embeddable Chat Widget code in this repository. Dashboard, auth, settings, and knowledge-base management experiences were not evaluated here.

Status key: `Supports`, `Partially Supports`, `Does Not Support`, `Not Applicable`, `Not Evaluated`

| Criterion | Status | Product areas | Rationale / evidence |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | Partially Supports | Floating widget, embedded widget, message UI | Core images now have text alternatives in evaluated flows, but third-party embeds and upstream content metadata need more manual validation |
| 1.2.1 Audio-only and Video-only (Prerecorded) | Not Applicable | Widget/embed package | No prerecorded audio/video content in evaluated scope |
| 1.2.2 Captions (Prerecorded) | Not Applicable | Widget/embed package | No prerecorded synchronized media in evaluated scope |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | Not Applicable | Widget/embed package | No prerecorded synchronized media in evaluated scope |
| 1.2.4 Captions (Live) | Not Applicable | Widget/embed package | No live audio/video media in evaluated scope |
| 1.2.5 Audio Description (Prerecorded) | Not Applicable | Widget/embed package | No prerecorded synchronized media in evaluated scope |
| 1.3.1 Info and Relationships | Partially Supports | Launcher, transcript, forms, embedded mode | Semantics improved for buttons, log, and form associations; custom transcript and markdown output still merit deeper assistive-tech validation |
| 1.3.2 Meaningful Sequence | Supports | Floating and embedded chat | Evaluated flows render in a meaningful DOM order |
| 1.3.3 Sensory Characteristics | Supports | Widget UI copy | Evaluated flows do not depend on sensory-only instructions |
| 1.3.4 Orientation | Supports | Floating and embedded widget | No orientation lock in this package |
| 1.3.5 Identify Input Purpose | Partially Supports | Lead-capture forms | Several schema-driven fields use `autocomplete`, but coverage depends on field schema and is not exhaustive |
| 1.4.1 Use of Color | Partially Supports | Widget theme, forms, status badges | Most controls and states are labeled, but arbitrary customer-selected theme colors were not exhaustively tested |
| 1.4.2 Audio Control | Not Applicable | Widget/embed package | No autoplaying audio |
| 1.4.3 Contrast (Minimum) | Partially Supports | Default widget theme | Default styling appears reasonable, but not all brand-color permutations were tested |
| 1.4.4 Resize Text | Partially Supports | Demo harness, widget UI | Demo zoom blocker was removed; full host-page and cross-browser zoom testing remains incomplete |
| 1.4.5 Images of Text | Supports | Widget/embed package | No essential images of text were identified in evaluated flows |
| 1.4.10 Reflow | Partially Supports | Floating and embedded widget | Responsive behavior is present, but a full 320 CSS px manual sweep was not completed across host contexts |
| 1.4.11 Non-text Contrast | Partially Supports | Focus indicators, control outlines | Focus styling improved substantially, but theme variability remains a risk |
| 1.4.12 Text Spacing | Not Evaluated | Widget/embed package | Not explicitly tested |
| 1.4.13 Content on Hover or Focus | Supports | Evaluated widget flows | No complex hover/focus-only overlays were observed in tested flows |
| 2.1.1 Keyboard | Supports | Floating and embedded widget | Keyboard-only flows passed for launcher, submit, source links, and escalation form interactions |
| 2.1.2 No Keyboard Trap | Supports | Floating and embedded widget | No keyboard trap observed in evaluated flows |
| 2.1.4 Character Key Shortcuts | Not Applicable | Widget/embed package | No single-character shortcut feature identified |
| 2.2.1 Timing Adjustable | Supports | Widget UI | No time-limited interaction was observed in evaluated scope |
| 2.2.2 Pause, Stop, Hide | Partially Supports | Streaming/status UI | Limited direct screen-reader testing informed remediation, but true live-streaming behavior still needs a broader structured validation pass |
| 2.3.1 Three Flashes or Below Threshold | Supports | Widget/embed package | No flashing content identified |
| 2.4.1 Bypass Blocks | Not Applicable | Widget component scope | This repo provides an embeddable widget rather than a full document/page information architecture |
| 2.4.2 Page Titled | Not Applicable | Widget component scope | Applicable to host pages; demo harness title is present |
| 2.4.3 Focus Order | Supports | Floating widget | Focus order was verified in key keyboard flows, including focus return on close |
| 2.4.4 Link Purpose (In Context) | Partially Supports | Source links, markdown links | Source-link purpose is generally clear, but depends partly on upstream source metadata and content titles |
| 2.4.5 Multiple Ways | Not Applicable | Widget component scope | Applies primarily to full-page navigation structures, not this component package |
| 2.4.6 Headings and Labels | Partially Supports | Header, transcript, forms | Labels improved; heading structure is limited in logo-only header mode and host-page context is outside scope |
| 2.4.7 Focus Visible | Supports | Core interactive controls | Visible focus indicators were added across key controls and verified in tested flows |
| 2.5.1 Pointer Gestures | Supports | Widget controls | Evaluated controls work with simple activation gestures |
| 2.5.2 Pointer Cancellation | Supports | Buttons and form controls | Controls use standard button/input behavior |
| 2.5.3 Label in Name | Partially Supports | Icon-only controls, upload/remove actions | Major controls now have names, but some ARIA-only strings remain generic or English-only |
| 2.5.4 Motion Actuation | Not Applicable | Widget/embed package | No motion-actuated features identified |
| 2.5.5 Target Size | Partially Supports | Small icon controls | Core controls are near 40px, but not all touch targets were manually measured across contexts |
| 2.5.6 Concurrent Input Mechanisms | Supports | Widget UI | Keyboard and pointer interaction coexist without known conflict in tested flows |
| 3.1.1 Language of Page | Partially Supports | Widget root, embedded mode | Widget root sets `lang`, but host-page language remains outside component control |
| 3.1.2 Language of Parts | Not Evaluated | Widget/embed package | Mixed-language output was not specifically tested |
| 3.2.1 On Focus | Supports | Widget controls | No unexpected context change on focus was observed |
| 3.2.2 On Input | Partially Supports | Chat submit, lead forms | Input behavior is predictable in tested flows, but dynamic backend-driven responses vary by configuration |
| 3.2.3 Consistent Navigation | Not Applicable | Widget component scope | Full-site navigation consistency is outside this repo |
| 3.2.4 Consistent Identification | Supports | Widget controls | Similar actions use consistent control types and naming in evaluated flows |
| 3.3.1 Error Identification | Partially Supports | Lead-capture and chat errors | Lead-form errors improved; broader backend/server error scenarios were not exhaustively tested |
| 3.3.2 Labels or Instructions | Partially Supports | Chat input, lead forms | Core labeling is improved, but some helper/status strings remain incomplete from a localization standpoint |
| 3.3.3 Error Suggestion | Partially Supports | Lead-capture forms | Required-field messaging is present; richer custom guidance for all constraint failures is limited |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Not Applicable | Widget/embed package | Evaluated scope does not contain high-risk transactional submission flows |
| 4.1.1 Parsing | Supports | Widget/embed package | No parsing issues were identified in rendered evaluated flows |
| 4.1.2 Name, Role, Value | Partially Supports | Launcher, buttons, forms, transcript | High-impact controls were corrected, but third-party embeds and some generic labels still need deeper review |
| 4.1.3 Status Messages | Partially Supports | Transcript, loading, agent activity, errors | Status semantics improved and limited direct screen-reader testing was performed, but live-streaming behavior still needs broader validation |
