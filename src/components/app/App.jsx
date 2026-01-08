import React, { useEffect, useState } from "react";
import ReactShadowRoot from "react-shadow-root";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactTailwindStyles from "!raw-loader!../../assets/css/docsbot-tw.min.css";
import reactChatbotStyles from "!raw-loader!../../assets/css/chatbot.min.css";
import katexStyles from "!raw-loader!../../assets/css/katex.min.css";
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
  // Workaround for Streamdown dropdown click-outside handlers not working in Shadow DOM.
  // The library uses document.addEventListener('mousedown') with event.target check,
  // but event.target is retargeted to shadow host when crossing shadow boundary.
  // This document-level handler uses composedPath() to check the real event origin.
  useEffect(() => {
    const handleDocumentMouseDown = (e) => {
      // Use composedPath to get the actual elements in the event path (works across shadow DOM)
      const path = e.composedPath();
      
      // Check if any element in the path is inside a Streamdown dropdown menu
      const isInsideStreamdownDropdown = path.some((el) => {
        if (!(el instanceof Element)) return false;
        // Check if this element is inside a streamdown dropdown (the .absolute positioned menu)
        const isDropdownItem = el.matches?.('[data-streamdown="table-wrapper"] .absolute button, [data-streamdown="table-wrapper"] .absolute, [data-streamdown="mermaid-block"] .absolute button, [data-streamdown="mermaid-block"] .absolute');
        return isDropdownItem;
      });
      
      if (isInsideStreamdownDropdown) {
        // Stop immediate propagation to prevent Streamdown's click-outside handler from running
        e.stopImmediatePropagation();
      }
    };

    // Add as capturing listener to run before Streamdown's bubbling listener
    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, []);

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
      <style type="text/css">{katexStyles}</style>
      <style type="text/css">{reactTailwindStyles}</style>
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
