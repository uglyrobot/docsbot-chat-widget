import React from 'react'
import { Chatbot } from '../chatbot/Chatbot';
import { ChatbotProvider } from '../chatbotContext/ChatbotContext';

import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import optionsStyles from "!raw-loader!../options/Options.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import embeddedChatStyles from "!raw-loader!./embeddedChat.css"

const EmbeddedChat = () => {

  return (
    <div style={{ height: '100%' }}>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{embeddedChatStyles}</style>
      <div className="docsbot-iframe-box">
        <ChatbotProvider>
          <Chatbot isEmbeddedBox={true} />
        </ChatbotProvider>
      </div>
    </div>
  )
}

export default EmbeddedChat