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

## Full component screenshot gallery

After the browser suite, run `node scripts/openui-gallery.mjs`. Open
`http://localhost:3005/openui-gallery/index.html` for 25 full-resolution widget
screenshots and an index of all 82 registered component names. Child/data
components are represented through their parents. Upstream `Slice` renders null
and has no standalone visual appearance. Generated gallery assets are ignored.

Eight catalogue cases add the typography primitives, image variants, structured
lists, editable table, all five card-block families, carousel, button variants
and modal dialog. Fixture shells expand for screenshots so lower rows remain
visible; runtime widget dimensions are unchanged.

## Brand styling review

The browser suite includes six brand colors in both light and dark mode, mobile
forms/cards, disabled streaming actions, secondary hover and keyboard focus.
Axe checks cover serious/critical issues inside the generated Shadow DOM surface.
`node --test src/components/generativeUi/theme.test.mjs` checks text (4.5:1) and
action/focus/chart accent (3:1) contrast for the theme tokens. The same token
helper and scoped CSS are used by dashboard chat and question/conversation logs.

The gallery now includes the brand matrix and compact component screenshots;
click a tile for the full widget capture. Optional baseline images in
`output/playwright/openui-before/` enable before/after comparisons. These local
images are not committed. No live model requests are made by these checks.

Typography follows the widget's native font stack: 14px body, 13px labels/table
copy, 15px card headings, and larger display headings capped at 22px. Text-entry
fields use 16px below 640px viewport width to match the widget's existing iOS
zoom safeguard. Narrow floating-widget checks compare input/body font family
and size against surrounding chat in light/dark mode.

## Every combination in four views

Run `node scripts/capture-openui-matrix.mjs`, then
`node scripts/openui-matrix-gallery.mjs`. The first script reuses the existing
checked-in synthetic fixture programs to render 24 component combinations at
448px and 740px, each light/dark (96 captures). It uses a temporary generated
Playwright spec, removes it afterwards, and blocks nonlocal requests. The
second script writes `public/openui-gallery/combos/index.html` with combination
and view filters. Captures contain the full widget, expanded vertically so
all generated rows remain visible. The catalogue covers 81 visual/child names;
upstream `Slice` returns null and has no standalone appearance.
