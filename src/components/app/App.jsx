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
import highlightJSStyles from "!raw-loader!highlight.js/styles/github.min.css";
import hljsCopyStyles from "!raw-loader!highlightjs-copy/dist/highlightjs-copy.min.css";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { Emitter } from "../../utils/event-emitter";
import { useConfig } from "../configContext/ConfigContext";

fontAwesomeConfig.autoAddCss = false;

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const { customCSS } = useConfig();

  useEffect(() => {
    const handleOpen = async () => {
      await setIsOpen(true);
      Emitter.emit("docsbot_open_complete");
    };

    const handleClose = async () => {
      await setIsOpen(false);
      Emitter.emit("docsbot_close_complete");
    };

    const handleToggle = async ({ isChatbotOpen }) => {
      await setIsOpen(isChatbotOpen);
      Emitter.emit("docsbot_toggle_complete");
    };

    Emitter.on("docsbot_open", handleOpen);
    Emitter.on("docsbot_close", handleClose);
    Emitter.on("docsbot_toggle", handleToggle);

    return () => {
      Emitter.off("docsbot_open", handleOpen);
      Emitter.off("docsbot_close", handleClose);
      Emitter.off("docsbot_toggle", handleToggle);
    };
  }, []);

  useEffect(() => {
    // Emit mount complete event when the component is fully mounted
    Emitter.emit("docsbot_mount_complete");

    return () => {
      // Emit unmount complete event when the component is about to unmount
      Emitter.emit("docsbot_unmount_complete");
    };
  }, []);

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{highlightJSStyles}</style>
      <style type="text/css">{hljsCopyStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{appStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      {customCSS ? <style type="text/css">{customCSS}</style> : null}

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
