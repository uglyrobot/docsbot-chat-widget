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
import { chatbotConfig } from "../../config";
import { Chatbot } from "../chatbot/Chatbot";
import { useConfig } from "../configContext/ConfigContext";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";

fontAwesomeConfig.autoAddCss = false;

function App({} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [userConfig, setUserConfig] = useState({});
  const userConf = useConfig();

  useEffect(() => {
    //override the default config with the user's config, only if the user's config is not empty
    let customMessages = chatbotConfig.initialMessages;
    if (userConf.initialMessage) {
      customMessages = [];
    }

    setUserConfig((prevConfig) => ({
      ...prevConfig,
    }));
  }, []);

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{appStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>

      <FloatingButton onClick={() => setIsOpen(!isOpen)} />
      {isOpen ? (
        <ChatbotProvider>
          <Chatbot />
        </ChatbotProvider>
      ) : null}
    </ReactShadowRoot>
  );
}

export default App;
