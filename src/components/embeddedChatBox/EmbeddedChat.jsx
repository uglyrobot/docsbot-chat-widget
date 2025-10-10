import React from "react";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import ReactShadowRoot from "react-shadow-root";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!../../assets/css/chatbot.min.css?raw";
import floatingButtonStyles from "!../../assets/css/FloatingButton.min.css?raw";
import optionsStyles from "!../../assets/css/Options.min.css?raw";
import linkListStyles from "!../../assets/css/LinkList.min.css?raw";
import embeddedChatStyles from "!../../assets/css/embeddedChat.min.css?raw";

const EmbeddedChat = () => {
  const { customCSS } = useConfig();

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
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
