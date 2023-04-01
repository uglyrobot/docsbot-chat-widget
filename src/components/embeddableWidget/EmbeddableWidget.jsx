import React from "react";
import ReactDOM from "react-dom/client";
import App from "../app/App";
import { ConfigProvider } from "../configContext/ConfigContext";

export default class EmbeddableWidget {
  static el;

  static init({ parentElement = null, ...props } = {}) {
    const component = (
      <ConfigProvider {...props}>
        <App {...props} />
      </ConfigProvider>
    );

    function doRender() {
      if (EmbeddableWidget.el) {
        throw new Error("EmbeddableWidget is already mounted, unmount first");
      }
      const el = document.createElement("div");

      if (parentElement) {
        document.querySelector(parentElement).appendChild(el);
      } else {
        document.body.appendChild(el);
      }
      ReactDOM.createRoot(el).render(component);
      EmbeddableWidget.el = el;
    }
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
      console.info("EmbeddableWidget is not mounted, mount first");
      return false
    }
    ReactDOM.unmountComponentAtNode(EmbeddableWidget.el);
    EmbeddableWidget.el.parentNode.removeChild(EmbeddableWidget.el);
    EmbeddableWidget.el = null;
  }
}
