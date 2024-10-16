import React from "react";
import ReactDOM from "react-dom/client";
import App from "../app/App";
import { ConfigProvider } from "../configContext/ConfigContext";
import { Emitter } from "../../utils/event-emitter";
import EmbeddedChat from '../embeddedChatBox/EmbeddedChat'
export default class EmbeddableWidget {
  static _root;
  static el;

  static isChatbotOpen = false;

  static open() {
    this.isChatbotOpen = true;
    Emitter.emit("OPEN_CHATBOT");
  }

  static close() {
    this.isChatbotOpen = false;
    Emitter.emit("CLOSE_CHATBOT");
  }

  static toggle() {
    this.isChatbotOpen = !this.isChatbotOpen;
    Emitter.emit("TOGGLE_CHATBOT", { isChatbotOpen: this.isChatbotOpen });
  }

  static mount({ parentElement = null, ...props } = {}) {
    const embeddedChatElement = document.getElementById('docsbot-widget-embed')
    const component = (
      <ConfigProvider {...props}>
        {
          embeddedChatElement ? <EmbeddedChat /> : <App isChatbotOpen={this.isChatbotOpen} {...props} />
        }
      </ConfigProvider>
    );

    const doRender = () => {
      if (EmbeddableWidget.el) {
        console.warn("EmbeddableWidget is already mounted, unmount first");
        return false
      }
      let el = null
      let root = null
      if (embeddedChatElement) {
        el = embeddedChatElement
      }
      else {
        el = document.createElement("div");
        el.id = "docsbotai-root";
        el.style.display = "block";
        if (parentElement) {
          document.querySelector(parentElement).appendChild(el);
        } else {
          document.body.appendChild(el);
        }
      }
      root = ReactDOM.createRoot(el);
      root.render(component);

      this._root = root;

      if (!EmbeddableWidget.el) {
        EmbeddableWidget.el = el;
      }
    };

    if (document.readyState === "complete") {
      doRender();
    } else {
      window.addEventListener("load", () => {
        doRender();
      });
    }
  }

  static unmount() {
    if (!EmbeddableWidget.el) {
      console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
      return false;
    }
    const div_root = document.getElementById("docsbotai-root");
    if (this._root) {
      this._root.unmount();
    }
    if (div_root) {
      div_root.remove();
    }
    EmbeddableWidget.el = null;
  }
}
