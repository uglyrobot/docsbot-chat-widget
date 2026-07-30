# DocsBot AI Chat Widget

Embeddable chat widget to integrate with DocsBot.ai

Full documentation can be found at https://docsbot.ai/docs/embeddable-chat-widget

### Reasoning Effort

When using the widget in agent mode with a signed request, you can control the reasoning depth of responses by supplying a `reasoningEffort` option. Valid values are `minimal`, `low`, `medium`, and `high`. The parameter is only sent to the API when `signature` is set.

### Inline Media Source Player

Set **`options.inlineMediaSourcePlayer`** to `true` to make YouTube and downloadable `media` sources open an inline player from the source row. The widget starts playback from timestamps already present in source URLs, including YouTube `t=` query params and media download `#t=start,end` fragments. Inline playback for `media` sources only activates when the source URL looks like a playable media file (or includes an audio/video mime type); original/HTML page URLs used when source downloads are disabled stay as normal external links.

### Live voice calls

When browser voice is enabled for a bot, the widget creates a browser WebRTC connection by posting its SDP offer to the DocsBot endpoint `/teams/{team_id}/bots/{bot_id}/voice`. OpenAI credentials are never sent to the browser. The existing `useAudioUpload` recorded-message control remains separate from live voice.

The live-call request sends the same flattened public `identify` fields chat-agent uses (plus `referrer` when missing) via the `X-DocsBot-Metadata` header — not a nested `metadata` object. Trusted `priv_*` values still come only from the signed JWT `signature`, never from client identify.

If the widget is placed inside an iframe, the embedding page must delegate microphone access:

```html
<iframe src="https://example.com/chat" allow="microphone"></iframe>
```

The embedding page's `Permissions-Policy` response header must also allow the framed origin when a restrictive policy is used, for example `Permissions-Policy: microphone=(self "https://example.com")`. Without both permissions, browsers may block the microphone without showing a permission prompt; the widget reports that distinction to the caller.

Set `options.useVoiceAgent` to `true` or `false` to override the bot’s server `useVoiceAgent` flag for the live-call control. When omitted, the widget uses the bot config. Voice uses the same API base as chat: the local API when `options.localDev` is true and `https://api.docsbot.ai` in production.

After the widget is mounted, call **`DocsBotAI.startVoiceCall()`** from a user gesture (for example a site button) to enter live voice mode. On the floating launcher it opens the panel if needed; in `#docsbot-widget-embed` it starts voice in the always-visible chat. It returns a Promise that resolves `true` when voice UI starts, or `false` if the widget is not mounted or voice is unavailable.

```js
document.getElementById('talk-btn').addEventListener('click', () => {
  DocsBotAI.startVoiceCall();
});
```

Public DOM events fire on `document` when live voice UI starts and ends:

```js
document.addEventListener('docsbot_voice_call_start', (event) => {
  console.log('voice started', event.detail.conversationId);
});
document.addEventListener('docsbot_voice_call_end', (event) => {
  console.log('voice ended', event.detail.conversationId);
});
```

| Event | When | `detail` |
|-------|------|----------|
| `docsbot_voice_call_start` | Voice WebRTC data channel opens (connecting UI settles) | `{ conversationId: string \| null }` |
| `docsbot_voice_call_end` | Caller leaves voice (End call, Back, remote close, etc.) | `{ conversationId: string \| null }` |
| `docsbot_tool_call` | Tool requested in text chat **or** live voice (same shape) | `{ name: string, data: object \| string \| null }` |

Finalized caller and agent transcripts are appended to the same canonical
conversation history as text-chat turns. Voice-mode `customButtonCallback` and
`supportCallback` calls therefore receive the complete mixed text-and-voice
history in their existing `history` argument; the callback signatures and
`event.preventDefault()` behavior are unchanged.

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

### Color theme

The widget defaults to light mode. Set `options.theme` to `'dark'` or `'auto'`
to override it:

```js
DocsBotAI.init({
  id: 'teamId/botId',
  options: {
    theme: 'light', // 'light' (default), 'dark', or 'auto'
    color: '#1292EE',
  },
});
```

`auto` follows the browser or OS color scheme and updates live when
`prefers-color-scheme` changes. The configured brand
color remains the fill for the header, launcher, and primary actions. Dark-mode
user messages use a quieter brand-tinted fill, while the widget derives
contrast-safe text, focus, link, and icon colors from the brand.

## Locales

Non-English strings live under **`src/locales/`** (one module per language). English defaults are in **`src/constants/defaultLabels.mjs`**. At runtime the widget merges defaults with the lazy-loaded locale. To add a language, add **`src/locales/<code>.js`** and register it in **`src/utils/localeImports.js`**. Run **`npm run test:labels`** to verify every locale has required keys and differs from English where expected. English matches in **`src/utils/localeLabelAllowlist.mjs`** should stay limited to rare cases where a specific term is genuinely identical in that language, not as a fallback for unfinished translations.

## Development

- `npm install` to install dependencies.
- `npm run start` to spin up a local server with hot reloading that can be accessed at http://localhost:3005/. The html for this page is found in `public/index.html`, and is used to test the embeddable chat widget on a local server. The embed code is using a test bot from the DocsBot.ai staff account.

## Production Deployment

A Github action is configured that on pushes to main builds the `build/chat.js` file, uploades it to BunnyCDN storage, and purges the CDN zone that is used by the embeddable chat widget.

## CDN

The embeddable chat widget is hosted on our CDN at https://widget.docsbot.ai/chat.js. The CDN caches this file for 1 day, and instructs browsers to cache it for 1hr as well. This means that if you update the embeddable chat widget, it may take up to 1hr for the changes to be reflected on customer sites after we automatically purge the CDN cache.

## Third-Party Notices

Third-party attribution and redistributed asset notices are maintained in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). A plain-text copy is also
published with the widget CDN build as `THIRD_PARTY_NOTICES.txt`.
