import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { defaultLabels } from "../../constants/defaultLabels.mjs";
import { loadLocaleModule } from "../../utils/loadLocaleModule";
import {
  mergeWidgetLabels,
  normalizeBotLanguage,
  pickBrowserLanguageTag,
  resolveBrowserLocale,
  resolveEffectiveRequestLanguageTag,
  resolveExplicitLocaleString,
} from "../../utils/mergeWidgetLabels.mjs";
import { resolveEffectivePiiRedactionConfig } from "../../utils/piiRedaction.mjs";
import {
  isVoiceAgentCallEnabled,
  resolveEffectiveVoiceAgentCallEnabled,
} from "../../utils/voiceAgentConfig.mjs";
import {
  resolveWidgetTheme,
  resolveWidgetThemePreference,
} from "../../utils/widgetTheme.mjs";

import { normalizeQuestions, pickQuestions, questionPool, validateRuntimeOptions, mergeRuntimeOptions } from "../../utils/runtimeWidgetOptions.mjs";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

/**
 * Labels merge order (see mergeWidgetLabels):
 * - Base: defaultLabels + lazy locale (browser)
 * - data.labels when data.language matches browser, non-empty values; pass-through footerMessage always when API non-empty
 * - On language mismatch: ignore remote for localized keys (keep locale), except pass-through keys
 * - options.labels wins for defined keys
 *
 * Widget JSON must include `language` (2-char, e.g. ja, en).
 */
function resolveEffectiveBrowserLocale(options) {
  const navLangs =
    typeof navigator !== "undefined" ? navigator.languages : undefined;
  const mode = options?.locale;
  if (mode === undefined || mode === null || mode === "auto") {
    return resolveBrowserLocale(navLangs);
  }
  if (typeof mode === "string") {
    const explicit = resolveExplicitLocaleString(mode);
    if (explicit !== null) return explicit;
  }
  return resolveBrowserLocale(navLangs);
}

export function ConfigProvider(props = {}) {
  const { id, supportCallback, customButtonCallback, identify, options, signature, children, registerOptionsUpdater } = props;
  const [config, setConfig] = useState(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  const updateIdentity = (data) => {
    setConfig((prevConfig) => {
      const nextIdentify = {
        ...prevConfig.identify,
        ...(data && typeof data === "object" ? data : {}),
      };

      if (
        data &&
        typeof data === "object" &&
        data.metadata &&
        typeof data.metadata === "object"
      ) {
        Object.assign(nextIdentify, data.metadata);
        delete nextIdentify.metadata;
      }

      return {
        ...prevConfig,
        identify: nextIdentify,
      };
    });
  };

  const localDev = options?.localDev;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(media.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateSystemTheme);
    } else {
      media.addListener?.(updateSystemTheme);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateSystemTheme);
      } else {
        media.removeListener?.(updateSystemTheme);
      }
    };
  }, []);

  useEffect(() => {
    if (!id || config) return;

    let cancelled = false;
    const baseUrl = localDev
      ? "http://localhost:3000/api"
      : "https://docsbot.ai/api";
    const apiUrl = `${baseUrl}/widget/${id}`;
    const [teamId, botId] = props.id.split("/");

    fetch(apiUrl, {
      method: "GET",
    })
      .then((response) => response.json())
      .then(async (data) => {
        if (cancelled) return;

        const pool = normalizeQuestions(
          Array.isArray(options?.questions) ? options.questions :
          Array.isArray(data.questions) ? data.questions : []
        );

        if (data.allowedDomains && data.allowedDomains.length > 0) {
          const currentDomain = window.location.hostname;
          const allowedDomains = data.allowedDomains.map((domain) =>
            domain.toLowerCase()
          );
          allowedDomains.push("localhost");
          allowedDomains.push("docsbot.ai");

          if (!allowedDomains.includes(currentDomain.toLowerCase())) {
            console.warn(
              `DOCSBOT: Current domain (${currentDomain}) is not in the list of allowed domains (${allowedDomains.join(", ")})`
            );
            return;
          }
        }

        const {
          labels: optionsLabels,
          branding,
          allowedDomains: optionsAllowedDomains,
          piiRedaction: optionsPiiRedaction,
          testing: optionsTesting,
          useVoiceAgent: optionsUseVoiceAgent,
          ...restOptions
        } = options || {};

        const navLangs =
          typeof navigator !== "undefined" ? navigator.languages : undefined;
        const browserLocale = resolveEffectiveBrowserLocale(options);
        const browserLocaleTag = pickBrowserLanguageTag(navLangs, browserLocale);
        const browserRequestLanguageTag =
          resolveEffectiveRequestLanguageTag(navLangs, options);
        const botLanguage = normalizeBotLanguage(data.language);
        const localeMod = await loadLocaleModule(browserLocale);

        if (cancelled) return;

        const mergedLabels = mergeWidgetLabels({
          defaultLabels,
          localeLabels: localeMod.labels,
          remoteLabels: data.labels,
          optionsLabels,
          botLanguage,
          browserLocale,
        });

        const textDirection = localeMod.isRTL ? "rtl" : "ltr";
        const useVoiceAgent = resolveEffectiveVoiceAgentCallEnabled(
          isVoiceAgentCallEnabled(data),
          optionsUseVoiceAgent
        );
        const piiRedaction = resolveEffectivePiiRedactionConfig(
          data.piiRedaction,
          optionsPiiRedaction,
          { localDev }
        );

        setConfig({
          ...data,
          teamId,
          botId,
          supportCallback,
          customButtonCallback,
          identify: identify || {},
          signature,
          ...restOptions,
          [questionPool]: pool,
          questions: pickQuestions(pool, options?.suggestedQuestions),
          suggestedQuestions: options?.suggestedQuestions ?? 3,
          testing: optionsTesting === true,
          // Bot config by default; options.useVoiceAgent overrides when set.
          useVoiceAgent,
          piiRedaction,
          labels: mergedLabels,
          textDirection,
          browserLocale,
          browserLocaleTag,
          browserRequestLanguageTag,
          theme: resolveWidgetThemePreference(data.theme, restOptions.theme),
        });
      })
      .catch((e) => {
        console.warn(`DOCSBOT: Error fetching config: ${e}`);
      });

    return () => {
      cancelled = true;
    };
  }, [id, config, localDev]);

  const ready = Boolean(config);
  useLayoutEffect(() => {
    if (!ready || !registerOptionsUpdater) return undefined;
    registerOptionsUpdater((options) => {
      const patch = validateRuntimeOptions(options);
      setConfig((previous) => mergeRuntimeOptions(previous, patch));
      return true;
    });
    return () => registerOptionsUpdater(null);
  }, [ready, registerOptionsUpdater]);

  if (!config) return null;

  const effectiveTheme = resolveWidgetTheme(config.theme, systemPrefersDark);

  return (
    <ConfigContext.Provider value={{ ...config, effectiveTheme, updateIdentity }}>
      {children}
    </ConfigContext.Provider>
  );
}
