# Business Recommendations

## Executive view

This repository now has a materially stronger accessibility baseline for the customer-facing chat widget, but it is still best positioned as an internal draft assessment rather than a final procurement artifact for high-scrutiny buyers.

## Recommendations

1. Commission a third-party accessibility audit before relying on these materials for universities, public sector, or larger enterprise procurement.
2. Provide the VPAT/ACR on request rather than publishing broad claims publicly until direct assistive-technology validation is complete.
3. Add accessibility checks to engineering QA for this package:
   - `npm run a11y`
   - `npm run test:labels`
   - `npm run build`
4. Assign ownership explicitly:
   - Engineering owns remediation and regression tests
   - Product/design owns copy, theme, and interaction acceptance
   - Compliance or leadership owns external-facing claims and procurement positioning
5. Add release gates for this widget:
   - no new critical axe violations
   - no regression in keyboard open/close/input flows
   - no broken label tests
6. Treat overclaiming as a procurement risk. Current materials support statements such as “evaluated against WCAG 2.1 AA criteria” more safely than claims of full compliance.

## Procurement implications

- Small commercial buyers:
  - Current materials are likely directionally useful if positioned as an honest internal draft.
- Enterprise buyers:
  - Likely sufficient for initial diligence, but expect follow-up questions about assistive-technology testing and third-party validation.
- Universities / public sector:
  - Likely insufficient on their own. A third-party audit and stronger AT evidence are recommended.

## 30/90 day roadmap

### Next 30 days

- Expand the completed VoiceOver testing and add NVDA validation
- Localize remaining ARIA-only strings
- Add contrast checks for representative theme colors

### Next 90 days

- Commission third-party audit
- Expand automation to third-party embeds and billing views
- Publish a maintained internal accessibility QA checklist for this package
