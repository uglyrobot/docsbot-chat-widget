import React, { useEffect, useState } from "react";
import ReactShadowRoot from "react-shadow-root";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import appStyles from "!raw-loader!./App.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import optionsStyles from "!raw-loader!../options/Options.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { Emitter } from "../../utils/event-emitter";

fontAwesomeConfig.autoAddCss = false;

function App() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    Emitter.on("OPEN_CHATBOT", () => {
      setIsOpen(true);
    });

    Emitter.on("CLOSE_CHATBOT", () => {
      setIsOpen(false);
    });

    Emitter.on("TOGGLE_CHATBOT", ({ isChatbotOpen }) => {
      setIsOpen(isChatbotOpen);
    });
  }, []);

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{appStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>

      <FloatingButton {...{isOpen, setIsOpen}} />
      {isOpen ? (
        <ChatbotProvider>
          <Chatbot {...{isOpen, setIsOpen}} />
        </ChatbotProvider>
      ) : null}
    </ReactShadowRoot>
  );
}

export default App;
