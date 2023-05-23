import React from "react";
import ReactDOM from "react-dom/client";
import App from "../app/App";
import { ConfigProvider } from "../configContext/ConfigContext";
import { Emitter } from "../../utils/event-emitter";

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
    const component = (
      <ConfigProvider {...props}>
        <App isChatbotOpen={this.isChatbotOpen} {...props} />
      </ConfigProvider>
    );

    const doRender = () => {
      if (EmbeddableWidget.el) {
        throw new Error("EmbeddableWidget is already mounted, unmount first");
      }
      const el = document.createElement("div");
      el.id = "docsbotai-root";

      if (parentElement) {
        document.querySelector(parentElement).appendChild(el);
      } else {
        document.body.appendChild(el);
      }

      const root = ReactDOM.createRoot(el);
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
    this._root.unmount();
    div_root.remove();
    EmbeddableWidget.el = null;
  }
}
