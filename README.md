# DocsBot AI Chat Widget

Embeddable chat widget to integrate with DocsBot.ai

Full documentation can be found at https://docsbot.ai/docs/embeddable-chat-widget

## Development

- `npm install` to install dependencies.
- `npm run start` to spin up a local server with hot reloading that can be accessed at http://localhost:3005/. The html for this page is found in `public/index.html`, and is used to test the embeddable chat widget on a local server. The embed code is using a test bot from the DocsBot.ai staff account.

## Production Deployment

Run `npm run prepare` to build the project before commiting to main. It's very important to run this before pushing to main, as it builds the `build/chat.js` file that is referenced by our CDN and used by the embeddable chat widget.

## CDN

The embeddable chat widget is hosted on our CDN at https://widget.docsbot.ai/chat.js. The CDN caches this file for 12hrs, and instructs browsers to cache it for 1hr as well. This means that if you update the embeddable chat widget, it may take up to 12hrs for the changes to be reflected on customer sites unless we manually purge the CDN cache.