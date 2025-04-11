import React from "react";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import ReactShadowRoot from "react-shadow-root";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import highlightJSStyles from "!raw-loader!highlight.js/styles/github.min.css";
import hljsCopyStyles from "!raw-loader!highlightjs-copy/dist/highlightjs-copy.min.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import optionsStyles from "!raw-loader!../options/Options.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import embeddedChatStyles from "!raw-loader!./embeddedChat.css";

const EmbeddedChat = () => {
  const { customCSS } = useConfig();
  
  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{highlightJSStyles}</style>
      <style type="text/css">{hljsCopyStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{embeddedChatStyles}</style>
      {customCSS ? <style type="text/css">{customCSS}</style> : null}

      <div className="docsbot-iframe-box">
        <ChatbotProvider>
          <Chatbot isEmbeddedBox={true} />
        </ChatbotProvider>
      </div>
    </ReactShadowRoot>
  );
};

export default EmbeddedChat;
