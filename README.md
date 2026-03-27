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

## Locales

Non-English strings live under **`src/locales/`** (one module per language). English defaults are in **`src/constants/defaultLabels.mjs`**. At runtime the widget merges defaults with the lazy-loaded locale. To add a language, add **`src/locales/<code>.js`** and register it in **`src/utils/localeImports.js`**. Run **`npm run test:labels`** to verify every locale has required keys and differs from English where expected (see **`src/utils/localeLabelAllowlist.mjs`** for allowed English matches).

## Development

- `npm install` to install dependencies.
- `npm run start` to spin up a local server with hot reloading that can be accessed at http://localhost:3005/. The html for this page is found in `public/index.html`, and is used to test the embeddable chat widget on a local server. The embed code is using a test bot from the DocsBot.ai staff account.

## Production Deployment

A Github action is configured that on pushes to main builds the `build/chat.js` file, uploades it to BunnyCDN storage, and purges the CDN zone that is used by the embeddable chat widget.

## CDN

The embeddable chat widget is hosted on our CDN at https://widget.docsbot.ai/chat.js. The CDN caches this file for 1 day, and instructs browsers to cache it for 1hr as well. This means that if you update the embeddable chat widget, it may take up to 1hr for the changes to be reflected on customer sites after we automatically purge the CDN cache.
