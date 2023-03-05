import React, { useState } from "react";
import Chatbot from "react-chatbot-kit";
import { MessageParser } from "../messageParser/MessageParser";
import { ActionProvider } from "../actionProvider/ActionProvider";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config } from "../../config";
import "react-chatbot-kit/build/main.css";
import "./App.css";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <FloatingButton onClick={() => setIsOpen(!isOpen)} />
      {isOpen ? (
        <div className="react-chatbot-kit-wrapper">
          <Chatbot
            config={config}
            actionProvider={ActionProvider}
            messageParser={MessageParser}
          />
        </div>
      ) : null}
    </>
  );
}

export default App;
