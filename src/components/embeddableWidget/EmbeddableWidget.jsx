import React from "react";
import ReactDOM from "react-dom/client";
import App from "../app/App";
import { ConfigProvider } from "../configContext/ConfigContext";
import { Emitter } from "../../utils/event-emitter";
import EmbeddedChat from "../embeddedChatBox/EmbeddedChat";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import { primeSharedVoiceToolWorkingChime } from "../../utils/voiceToolWorkingChime.mjs";
import voiceToolWorkingSrc from "../../assets/audio/voiceToolWorkingSrc.mjs";
import voiceToolSearchingSrc from "../../assets/audio/voiceToolSearchingSrc.mjs";
import {
  clearPendingStartVoiceCall,
  hasPendingStartVoiceCall,
  markPendingStartVoiceCall,
} from "../../utils/voiceCallJsApi.mjs";

import { waitForMessageHandler } from "../../utils/widgetMessageReady.mjs";

fontAwesomeConfig.autoAddCss = false;

export default class EmbeddableWidget {
  static _root;
  static _optionsUpdater = null;
  static _registerOptionsUpdater = (updater) => {
    EmbeddableWidget._optionsUpdater = updater;
  };

  // Returns true when accepted; React applies the patch on its next render.
  static updateOptions(options) {
    if (!this._root || !this._optionsUpdater) return false;
    return this._optionsUpdater(options);
  }

  static el;
  static teamId;
  static botId;

  static isChatbotOpen = false;
  /** True when mounted into `#docsbot-widget-embed` (always-visible chat). */
  static isEmbeddedMount = false;

  static open() {
    return new Promise((resolve) => {
      // Embedded chat is always mounted/visible — no panel to open.
      if (this.isEmbeddedMount) {
        this.isChatbotOpen = true;
        resolve();
        return;
      }
      this.isChatbotOpen = true;
      Emitter.emit("docsbot_open");
      Emitter.once("docsbot_open_complete", resolve);
    });
  }

  static close() {
    return new Promise((resolve) => {
      if (this.isEmbeddedMount) {
        resolve();
        return;
      }
      this.isChatbotOpen = false;
      Emitter.emit("docsbot_close");
      Emitter.once("docsbot_close_complete", resolve);
    });
  }

  static toggle() {
    return new Promise((resolve) => {
      if (this.isEmbeddedMount) {
        this.isChatbotOpen = true;
        resolve();
        return;
      }
      this.isChatbotOpen = !this.isChatbotOpen;
      Emitter.emit("docsbot_toggle", { isChatbotOpen: this.isChatbotOpen });
      Emitter.once("docsbot_toggle_complete", resolve);
    });
  }

  /**
   * Enter live voice mode (floating or `#docsbot-widget-embed`).
   * Floating: opens the panel if needed. Embed: starts in the always-on chat.
   * Call from a user gesture (e.g. site button click) so mic/audio unlock.
   * Resolves true when voice UI starts, false if unavailable or not mounted.
   */
  static startVoiceCall() {
    return new Promise(async (resolve) => {
      if (!this._root) {
        console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
        resolve(false);
        return;
      }

      // Unlock tool chimes under this click before React mounts VoiceCallView.
      void primeSharedVoiceToolWorkingChime([
        voiceToolWorkingSrc,
        voiceToolSearchingSrc,
      ]);
      markPendingStartVoiceCall();

      let settled = false;
      const finish = (started) => {
        if (settled) return;
        settled = true;
        clearPendingStartVoiceCall();
        resolve(Boolean(started));
      };

      Emitter.once("docsbot_start_voice_call_complete", finish);

      // Floating needs the panel open (Chatbot mounts on open). Embed Chatbot
      // is already mounted; open() is a no-op resolve there.
      if (!this.isChatbotOpen) {
        await this.open();
      }

      // Already-mounted Chatbot listens here. Fresh floating mounts also
      // consume the pending flag in their effect (open completes before commit).
      if (!settled) {
        Emitter.emit("docsbot_start_voice_call");
      }

      window.setTimeout(() => {
        if (settled) return;
        if (hasPendingStartVoiceCall()) {
          console.warn(
            "DOCSBOT: Unable to start voice call (voice unavailable or widget not ready)"
          );
        }
        finish(false);
      }, 5000);
    });
  }

  static async addUserMessage(message, send = false) {
    if (!this._root) {
      console.warn("DOCSBOT: EmbeddableWidget is not mounted, mount first");
      return false;
    }
    if (typeof message !== "string" || !message.trim()) return false;

    // Chatbot mounts only when the floating panel opens, including for
    // display-only messages. Inline chat is already visible.
    if (!this.isEmbeddedMount) await this.open();
    if (!(await waitForMessageHandler(Emitter))) return false;

    return new Promise((resolve) => {
      Emitter.once("docsbot_add_user_message_complete", resolve);
      Emitter.emit("docsbot_add_user_message", { message, send });
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
      this.isEmbeddedMount = Boolean(embeddedChatElement);
      // Embed surface is always visible; treat as open for JS helpers.
      if (this.isEmbeddedMount) {
        this.isChatbotOpen = true;
      }
      const component = (
        <ConfigProvider {...props} registerOptionsUpdater={this._registerOptionsUpdater}>
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
          // Existing embed snippets wait for this ID before resolving init().
          el = document.createElement("div");
          el.id = "docsbotai-root";
          el.style.height = "100%";
          embeddedChatElement.appendChild(el);
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
      this._optionsUpdater = null;
      clearPendingStartVoiceCall();
      const div_root = document.getElementById("docsbotai-root");
      if (this._root) {
        this._root.unmount();
      }
      if (div_root) {
        div_root.remove();
      }
      EmbeddableWidget.el = null;
      this._root = null;
      this.isEmbeddedMount = false;
      this.isChatbotOpen = false;

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
        localStorage.removeItem(`DocsBot_${this.botId}_chatHistory`);
        localStorage.removeItem(`DocsBot_${this.botId}_localChatHistory`);
        localStorage.removeItem(`DocsBot_${this.botId}_conversationId`);
        const piiSessionPrefix = `DocsBot_${this.botId}_piiRedactionSession_`;
        const piiSessionKeys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(piiSessionPrefix)) {
            piiSessionKeys.push(key);
          }
        }
        piiSessionKeys.forEach((key) => localStorage.removeItem(key));
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
