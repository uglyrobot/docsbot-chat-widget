import React from "react";
import ReactDOM from "react-dom/client";
import EmbeddedChat from './components/embeddedChatBox/EmbeddedChat'

const root = ReactDOM.createRoot(document.getElementById('docsbot-widget-embed'))

root.render(
    <>
        <EmbeddedChat />
    </>
)