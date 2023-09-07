import React from "react";
import ReactDOM  from "react-dom/client";
import EmbeddedChat from './EmbeddedChat'

const root = ReactDOM.createRoot(document.getElementById('docsbot-widget-embed'))

root.render(
  <EmbeddedChat />
)