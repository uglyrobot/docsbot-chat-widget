# DocsBot AI Chat Widget

Embeddable chat widget to integrate with DocsBot.ai

Full documentation can be found at https://docsbot.ai/docs/embeddable-chat-widget

### Suggested questions

By default the widget displays up to three random suggested questions from your bot's training data. You can override this amount by passing `suggestedQuestions` in the embed options:

```html
<script>
DocsBotAI.init({
  id: "TEAM/BOT",
  options: {
    suggestedQuestions: 4 // show four suggestions instead of three
  }
});
</script>
```

## Development

- `npm install` to install dependencies.
- `npm run start` to spin up a local server with hot reloading that can be accessed at http://localhost:3005/. The html for this page is found in `public/index.html`, and is used to test the embeddable chat widget on a local server. The embed code is using a test bot from the DocsBot.ai staff account.

## Production Deployment

A Github action is configured that on pushes to main builds the `build/chat.js` file, uploades it to BunnyCDN storage, and purges the CDN zone that is used by the embeddable chat widget.

## CDN

The embeddable chat widget is hosted on our CDN at https://widget.docsbot.ai/chat.js. The CDN caches this file for 1 day, and instructs browsers to cache it for 1hr as well. This means that if you update the embeddable chat widget, it may take up to 1hr for the changes to be reflected on customer sites after we automatically purge the CDN cache.