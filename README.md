# DocsBot AI Chat Widget

Embeddable chat widget to integrate with DocsBot.ai

Full documentation can be found at https://docsbot.ai/docs/embeddable-chat-widget

### Reasoning Effort

When using the widget in agent mode with a signed request, you can control the reasoning depth of responses by supplying a `reasoningEffort` option. Valid values are `minimal`, `low`, `medium`, and `high`. The parameter is only sent to the API when `signature` is set.

### `signature`: legacy HMAC or JWT (Stripe tools, private bots)

Pass **`signature`** in `DocsBotAI.mount` / `init`. It may be either the **legacy expiring HMAC** string or an **HS256 JWT** signed with your bot’s **signature key** (Widget embed page). The widget sends `Authorization: Bearer <signature>` on chat-agent and related API calls.

For **Stripe Actions**, put `priv_stripe_customer_id` only inside the JWT payload (`metadata.priv_stripe_customer_id`). Do **not** put it in client-side `identify` or public `metadata`.

Generate a test token locally:

```bash
DOCSBOT_SIGNATURE_KEY="…" node scripts/docsbot-sign-metadata-jwt.mjs
```

Optional env vars: `DOCSBOT_TEAM_ID`, `DOCSBOT_BOT_ID`, `STRIPE_CUSTOMER_ID`, `DOCSBOT_JWT_TTL_SEC`.

### Custom CTA buttons (agent mode)

When using the **agent** chat API, you can opt in to `custom_button` terminal events from the model:

- Set **`options.useCustomButtons`** to `true`. The widget then sends `custom_buttons: true` on the agent `POST` body so the backend may return a `custom_button` SSE event (markdown body plus one CTA).
- Optionally pass a top-level **`customButtonCallback`** — `(event, key, button, history, metadata) => void | Promise<void>` — to observe or override the default behavior. **`key`** is the server `functionKey` for this CTA (use it to branch on which button was clicked). **`button`** is `{ functionKey, url, buttonText, message, answer }`. Call **`event.preventDefault()`** on the synthetic `event` to cancel opening the CTA URL in a new tab. The **`metadata`** object merges `identify` with `conversationId`, `conversationUrl` (when in agent mode), `answerType: 'custom_button'`, `functionKey`, `url`, `buttonText`, and `message`. If the callback throws, the widget logs a warning and still performs default navigation when not cancelled.

This mirrors the pattern of **`supportCallback`** (separate callback, host-controlled navigation), but without ticket or escalation API calls. Example:

```js
DocsBotAI.init({
  id: 'teamId/botId',
  customButtonCallback: async (event, key, button, history, metadata) => {
    if (key === 'book_demo') {
      // Let the default behavior run: open button.url in a new tab
      return;
    }
    if (key === 'handle_in_app') {
      event.preventDefault(); // skip default new-tab navigation for this key only
      // e.g. route in your SPA using button.url or metadata
      return;
    }
    // Optional: guard for unknown keys
    // console.warn('Unhandled custom button key:', key);
  },
  options: {
    isAgent: true,
    useCustomButtons: true,
  },
});
```

## Locales

Non-English strings live under **`src/locales/`** (one module per language). English defaults are in **`src/constants/defaultLabels.mjs`**. At runtime the widget merges defaults with the lazy-loaded locale. To add a language, add **`src/locales/<code>.js`** and register it in **`src/utils/localeImports.js`**. Run **`npm run test:labels`** to verify every locale has required keys and differs from English where expected. English matches in **`src/utils/localeLabelAllowlist.mjs`** should stay limited to rare cases where a specific term is genuinely identical in that language, not as a fallback for unfinished translations.

## Development

- `npm install` to install dependencies.
- `npm run start` to spin up a local server with hot reloading that can be accessed at http://localhost:3005/. The html for this page is found in `public/index.html`, and is used to test the embeddable chat widget on a local server. The embed code is using a test bot from the DocsBot.ai staff account.

## Production Deployment

A Github action is configured that on pushes to main builds the `build/chat.js` file, uploades it to BunnyCDN storage, and purges the CDN zone that is used by the embeddable chat widget.

## CDN

The embeddable chat widget is hosted on our CDN at https://widget.docsbot.ai/chat.js. The CDN caches this file for 1 day, and instructs browsers to cache it for 1hr as well. This means that if you update the embeddable chat widget, it may take up to 1hr for the changes to be reflected on customer sites after we automatically purge the CDN cache.
