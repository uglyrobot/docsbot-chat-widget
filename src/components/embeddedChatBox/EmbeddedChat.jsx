import React, { useEffect, useState } from 'react'
import { Chatbot } from '../chatbot/Chatbot';
import { ChatbotProvider } from '../chatbotContext/ChatbotContext';
import { ConfigProvider } from '../configContext/ConfigContext';

import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import optionsStyles from "!raw-loader!../options/Options.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import embeddedChatStyles from "!raw-loader!./embeddedChat.css"

const EmbeddedChat = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [config] = useState({
    id: "ZrbLG98bbxZ9EFqiPvyl/UaRQtd7AOTaMXeRQGQRl",
  })

  const handleOpenEmbeddedBox = () => {
    const floatChatBox = document.getElementById('docsbotai-root')
    if (floatChatBox) {
      window?.DocsBotAI.unmount()
    }
    setIsOpen(true)
  }

  useEffect(() => {
    const reinitBtn = document.getElementById("reinit-btn");
    const reinitBtnEventListener = reinitBtn.addEventListener("click", () => {
      setIsOpen(false)
    })

    return () => {
      removeEventListener(reinitBtnEventListener)
    }
  }, [])

  return (
    <div style={{ height: '100%' }}>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{embeddedChatStyles}</style>
      <div className="docsbot-iframe-box">
          <ConfigProvider {...config}>
            <ChatbotProvider>
              <Chatbot {...{ isOpen, setIsOpen }} isEmbeddedBox={true} />
            </ChatbotProvider>
          </ConfigProvider>
        </div>
    </div>
  )
}

export default EmbeddedChat