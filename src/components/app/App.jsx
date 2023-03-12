import React, { useEffect, useState } from "react";
import Chatbot from "react-chatbot-kit";
import { createChatBotMessage } from "react-chatbot-kit";
import ReactShadowRoot from "react-shadow-root";
import { MessageParser } from "../messageParser/MessageParser";
import { ActionProvider } from "../actionProvider/ActionProvider";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config } from "../../config";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!react-chatbot-kit/build/main.css";
import appStyles from "!raw-loader!./App.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import initialOptionsStyles from "!raw-loader!../initialOptions/InitialOptions.css";
import messageWidgetStyles from "!raw-loader!../messageWidget/MessageWidget.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import { useConfig } from "../configContext/ConfigContext";
import { ThemeColors } from "../../constants/theme";

fontAwesomeConfig.autoAddCss = false;

function App({} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [userConfig, setUserConfig] = useState(config);
  const userConf = useConfig();

  useEffect(() => {
    //override the default config with the user's config, only if the user's config is not empty
    let customMessages = config.initialMessages;
    if (userConf.initialMessage) {
      customMessages = [
        createChatBotMessage(userConf.initialMessage),
      ]
    }

    setUserConfig((prevConfig) => ({
      ...prevConfig,
      botName: userConf.botName || prevConfig.botName,
      //initialMessages: customMessages,
      customStyles: {
        botMessageBox: {
          backgroundColor: userConf?.colors?.primary || ThemeColors.primaryColor,
        },
        chatButton: {
          backgroundColor: userConf?.colors?.primary || ThemeColors.primaryColor,
        },
      },
    }));
  }, []);

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{appStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{initialOptionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{messageWidgetStyles}</style>
      <FloatingButton onClick={() => setIsOpen(!isOpen)} />
      {isOpen ? (
        <div className="react-chatbot-kit-wrapper">
          <Chatbot
            config={userConfig}
            actionProvider={ActionProvider}
            messageParser={MessageParser}
          />
        </div>
      ) : null}
    </ReactShadowRoot>
  );
}

export default App;
