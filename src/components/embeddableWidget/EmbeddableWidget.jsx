import React from "react";
import ReactDOM from "react-dom/client";
import App from "../app/App";
import { ConfigProvider } from "../configContext/ConfigContext";
import { Emitter } from "../../utils/event-emitter";
import EmbeddedChat from "../embeddedChatBox/EmbeddedChat";

export default class EmbeddableWidget {
  static _root;
  static el;
  static teamId;
  static botId;

  static isChatbotOpen = false;

  static open() {
    return new Promise((resolve) => {
      this.isChatbotOpen = true;
      Emitter.emit("docsbot_open");
      Emitter.once("docsbot_open_complete", resolve);
    });
  }

  static close() {
    return new Promise((resolve) => {
      this.isChatbotOpen = false;
      Emitter.emit("docsbot_close");
      Emitter.once("docsbot_close_complete", resolve);
    });
  }

  static toggle() {
    return new Promise((resolve) => {
      this.isChatbotOpen = !this.isChatbotOpen;
      Emitter.emit("docsbot_toggle", { isChatbotOpen: this.isChatbotOpen });
      Emitter.once("docsbot_toggle_complete", resolve);
    });
  }

  static addUserMessage(message, send = false) {
    return new Promise(async (resolve) => {
      if (!this._root) {
        console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
        resolve(false);
        return;
      }

      if (send) {
        await this.open();
      }

      Emitter.emit("docsbot_add_user_message", { message, send });
      Emitter.once("docsbot_add_user_message_complete", resolve);
    });
  }

  static addBotMessage(message) {
    return new Promise((resolve) => {
      if (!this._root) {
        console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
        resolve(false);
        return;
      }

      Emitter.emit("docsbot_add_bot_message", { message });
      Emitter.once("docsbot_add_bot_message_complete", resolve);
    });
  }

  static mount({ parentElement = null, ...props } = {}) {
    return new Promise((resolve) => {
      if (props.id) {
        // Split the id into teamId and botId (format: teamId/botId)
        const [teamId, botId] = props.id.split('/');
        this.teamId = teamId;
        this.botId = botId;
      }
      
      const embeddedChatElement = document.getElementById(
        "docsbot-widget-embed"
      );
      const component = (
        <ConfigProvider {...props}>
          {embeddedChatElement ? (
            <EmbeddedChat />
          ) : (
            <App isChatbotOpen={this.isChatbotOpen} {...props} />
          )}
        </ConfigProvider>
      );

      const doRender = () => {
        if (EmbeddableWidget.el) {
          console.warn("DOCSBOT: EmbeddableWidget is already mounted, unmount first");
          resolve(false);
          return;
        }
        let el = null;
        let root = null;
        if (embeddedChatElement) {
          el = embeddedChatElement;
        } else {
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

        Emitter.emit("docsbot_mount");

        Emitter.once("docsbot_mount_complete", resolve);
      };

      if (document.readyState === "complete") {
        doRender();
      } else {
        window.addEventListener("load", () => {
          doRender();
        });
      }
    });
  }

  static unmount() {
    return new Promise((resolve) => {
      if (!EmbeddableWidget.el) {
        console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
        resolve(false);
        return;
      }
      const div_root = document.getElementById("docsbotai-root");
      if (this._root) {
        this._root.unmount();
      }
      if (div_root) {
        div_root.remove();
      }
      EmbeddableWidget.el = null;

      Emitter.emit("docsbot_unmount");
      Emitter.once("docsbot_unmount_complete", resolve);
    });
  }

  static clearChatHistory() {
    return new Promise((resolve) => {
      if (!this._root) {
        console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
        resolve(false);
        return;
      }

      if (this.botId) {
        localStorage.removeItem(`${this.botId}_docsbot_chat_history`);
        localStorage.removeItem(`${this.botId}_chatHistory`);
        //console.log(`Cleared chat history for bot ID: ${this.botId}`);
      } else {
        console.warn("DOCSBOT: No bot ID found, cannot clear chat history");
        resolve(false);
        return;
      }

      Emitter.emit("docsbot_clear_history");
      
      const timeoutId = setTimeout(() => {
        resolve(true);
      }, 100);
      
      Emitter.once("docsbot_clear_history_complete", () => {
        clearTimeout(timeoutId);
        resolve(true);
      });
    });
  }
}
