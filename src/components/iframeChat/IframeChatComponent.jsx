import React, { useState } from 'react'
import { Resizable } from 're-resizable';
import { Chatbot } from '../chatbot/Chatbot';
import { ChatbotProvider } from '../chatbotContext/ChatbotContext';
import { ConfigProvider } from '../configContext/ConfigContext';

import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import optionsStyles from "!raw-loader!../options/Options.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";
import iframeChatStyles from "!raw-loader!./iframeChat.css"

const IframeChatComponent = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [height, setHeight] = useState(500)
  const [width, setWidth] = useState(1000)
  const [config] = useState( {
    id: "ZrbLG98bbxZ9EFqiPvyl/UaRQtd7AOTaMXeRQGQRl",
  })

  return (
    <div>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{optionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{iframeChatStyles}</style>

      <div className="button-container">
        <button onClick={() => setIsOpen(true)}>Open iframe chat</button>
        <button onClick={() => setIsOpen(false)}>Close iframe chat</button>
      </div>
      {
        isOpen ? <Resizable
          size={{ width: width, height: height }}
          className="iframe-box"
          onResizeStop={(e, direction, ref, d) => {
            setWidth(width + d.width)
            setHeight(height + d.height)
          }}
          minHeight={400}
          minWidth={400}
          maxWidth={"100%"}
        >
          <ConfigProvider {...config}>
          <ChatbotProvider>
            <Chatbot {...{ isOpen, setIsOpen }} isIframeBox={true}/>
          </ChatbotProvider>
          </ConfigProvider>
        </Resizable> : null
      }
    </div>
  )
}

export default IframeChatComponent