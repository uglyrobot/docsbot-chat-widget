import React, { useEffect, useState } from "react";
import ReactShadowRoot from "react-shadow-root";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../assets/css/chatbot.min.css";
import appStyles from "!raw-loader!../../assets/css/App.min.css";
import floatingButtonStyles from "!raw-loader!../../assets/css/FloatingButton.min.css";
import optionsStyles from "!raw-loader!../../assets/css/Options.min.css";
import linkListStyles from "!raw-loader!../../assets/css/LinkList.min.css";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { Emitter } from "../../utils/event-emitter";
import { useConfig } from "../configContext/ConfigContext";

// fontAwesomeConfig.autoAddCss is set at the entrypoint (EmbeddableWidget)

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
