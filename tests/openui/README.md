# Synthetic OpenUI browser checks

These tests load the actual development widget bundle and exercise its
`OpenUIResponse` component with the pinned OpenUI library. Every browser context
uses fake team/bot identifiers and a synthetic widget configuration with external
tools disabled. The fetch interceptor returns a controlled `ReadableStream` for
chat requests; network routing blocks all other nonlocal requests. The local API,
staging database, source retrieval, signing keys, and model providers are unused.

Start the widget development server on port 3005, then run:

```bash
npx playwright install chromium
npm run test:openui:browser
```

The default target is `http://127.0.0.1:3005`. `WIDGET_TEST_URL` can select a
different local dev server. No production build is triggered.

Coverage:

- Official OpenUI cards, text, callouts, metrics and tables alongside ordinary answer text and source links.
- Image cards, ten chart variants, forms with validation and submission, selection controls, tabs and accordion.
- Dark mode and narrow mobile layouts.
- Enabled widgets prewarm only on open; disabled widgets load the renderer only for a UI message in history.
- Native widget tool events received alongside answer/UI SSE events.
- Disabled UI request omits the opt-in and retains the ordinary answer.
- Rejected action components, mismatched spec hashes, and malformed syntax leave
  readable answer text usable.
- Incomplete transport frames and partial UI programs render before the final
  event, then settle into the completed response.
- Local saved conversation replay after reload, without another chat request.
- Axe accessibility checks for critical/serious violations in the rendered widget.

Screenshots, test results, and failure traces are written to
`output/playwright/openui/`. These checks verify rendering and client transport
handling. They do not verify live model generation or retrieval quality.
