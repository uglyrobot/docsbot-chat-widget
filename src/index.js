import React from "react";
import ReactDOM from "react-dom/client";
import EmbeddedChat from './components/embeddedChatBox/EmbeddedChat'

let el = null;
const embeddedElement = document.getElementById('docsbot-widget-embed')
if (embeddedElement) {
    el = embeddedElement
}
else {
    const embeddedElement = document.createElement("div");
    embeddedElement.id = "docsbot-widget-embed";
    embeddedElement.style = "width:600px;height:450px;margin:auto 20px;"
    document.body.appendChild(embeddedElement)
    el = embeddedElement
}

const root = ReactDOM.createRoot(el)

root.render(
    <>
        <EmbeddedChat />
    </>
)