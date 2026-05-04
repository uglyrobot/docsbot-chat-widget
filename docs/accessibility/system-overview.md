# DocsBot Chat Widget Accessibility System Overview

Scope note: This review covers only the code in `docsbot-chat-widget`, specifically the public floating widget, embedded chat mode, shared chat UI components, and the local demo harness. DocsBot dashboard, authentication, settings, and knowledge-base management surfaces are not present in this repository and were not evaluated.

## Architecture

- Framework: React 18 with function components and hooks.
- Build/runtime: webpack 5 bundles `src/components/embeddableWidget/EmbeddableWidget.jsx` into `build/chat.js`.
- Styling: SCSS compiled by Gulp plus Tailwind-generated utility CSS.
- Rendering model: the widget mounts into an open Shadow DOM via `react-shadow-root`.
- Routing: none in this repository.
- State/context: `ConfigContext` loads widget configuration and locale data; `ChatbotContext` stores message state.

## Main audited surfaces

- Floating launcher and floating chat shell:
  - `src/components/floatingButton/FloatingButton.jsx`
  - `src/components/app/App.jsx`
  - `src/components/chatbot/Chatbot.jsx`
- Embedded chat mode:
  - `src/components/embeddedChatBox/EmbeddedChat.jsx`
- Message and transcript UI:
  - `src/components/botChatMessage/BotChatMessage.jsx`
  - `src/components/userChatMessage/UserChatMessage.jsx`
  - `src/components/source/Source.jsx`
  - `src/components/options/Options.jsx`
- Forms and dynamic follow-up UI:
  - `src/components/leadCollectMessage/LeadCollectMessage.jsx`
  - `src/components/stripeBilling/StripeBilling.jsx`
  - `src/components/calendlyEmbed/CalendlyEmbed.jsx`
  - `src/components/calComEmbed/CalComEmbed.jsx`
  - `src/components/tidyCalEmbed/TidyCalEmbed.jsx`
- Demo harness used for local testing:
  - `public/index.html`

## Shared implementation details that affect accessibility globally

- Locale/label merge:
  - `src/constants/defaultLabels.mjs`
  - `src/utils/mergeWidgetLabels.mjs`
  - `src/utils/loadLocaleModule.js`
- Network and dynamic updates:
  - `Chatbot.jsx` streams answers with `@microsoft/fetch-event-source`.
- Markdown rendering:
  - `src/components/streamdown/LazyStreamdown.jsx`
- Visual tokens and focus styling:
  - `src/assets/scss/`

## Third-party libraries and notable dependencies

- `react-shadow-root`: Shadow DOM encapsulation; important for focus order and selector strategy in tests.
- `@fortawesome/react-fontawesome`: icon rendering.
- `streamdown` and related plugins: markdown, code, math, mermaid rendering.
- `@microsoft/fetch-event-source`: SSE streaming for agent responses.
- Scheduler embeds: Calendly, Cal.com, TidyCal.

## Accessibility tooling present before this work

- Existing:
  - locale completeness and merge tests only (`npm run test:labels`)
- Added during this work:
  - `eslint` + `eslint-plugin-jsx-a11y`
  - `@playwright/test`
  - `@axe-core/playwright`
  - `eslint.config.mjs`
  - `playwright.config.mjs`
  - `tests/accessibility/widget.a11y.spec.mjs`

## Accessibility-related implementation observations

- The widget is not implemented as a modal dialog. It behaves as a floating or embedded region/panel.
- Because the widget renders in Shadow DOM, accessibility checks and keyboard testing must target the mounted host and pierce into the shadow root.
- The demo harness in `public/index.html` is a test surface, not proof of production host-page accessibility.
