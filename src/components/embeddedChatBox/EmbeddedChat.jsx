import React, { useEffect } from "react";
import { Chatbot } from "../chatbot/Chatbot";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import ReactShadowRoot from "react-shadow-root";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactTailwindStyles from "!../../assets/css/docsbot-tw.min.css?raw";
import reactChatbotStyles from "!../../assets/css/chatbot.min.css?raw";
import katexStyles from "!../../assets/css/katex.min.css?raw";
import floatingButtonStyles from "!../../assets/css/FloatingButton.min.css?raw";
import optionsStyles from "!../../assets/css/Options.min.css?raw";
import linkListStyles from "!../../assets/css/LinkList.min.css?raw";
import embeddedChatStyles from "!../../assets/css/embeddedChat.min.css?raw";

const EmbeddedChat = () => {
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

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{katexStyles}</style>
      <style type="text/css">{reactTailwindStyles}</style>
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
