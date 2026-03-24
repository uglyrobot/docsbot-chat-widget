import { createContext, useContext, useEffect, useState } from "react";
import { defaultLabels } from "../../constants/defaultLabels.js";
import { loadLocaleModule } from "../../utils/loadLocaleModule";
import {
  mergeWidgetLabels,
  normalizeBotLanguage,
  resolveBrowserLocale,
  toBaseLanguageCode,
} from "../../utils/mergeWidgetLabels";

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
function normalizeSuggestedQuestionItem(item) {
  if (typeof item === "string") {
    const s = item.trim();
    return s ? { label: s, question: s } : null;
  }
  if (item && typeof item === "object") {
    const question =
      typeof item.question === "string" ? item.question.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const q = question || label;
    const l = label || question;
    return q ? { label: l, question: q } : null;
  }
  return null;
}

const grabQuestions = (questions, limit = 3) => {
  if (!questions?.length) return [];

  const cap = Math.min(limit, questions.length);
  const picked = [];
  const seen = new Set();
  let guard = 0;
  const maxGuard = cap * questions.length * 8 + questions.length;

  while (picked.length < cap && guard < maxGuard) {
    guard++;
    const randomIndex = Math.floor(Math.random() * questions.length);
    const item = questions[randomIndex];
    const key = item.question;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
  }

  return picked;
};

function resolveEffectiveBrowserLocale(options) {
  const mode = options?.locale;
  if (mode === undefined || mode === null || mode === "auto") {
    return resolveBrowserLocale(
      typeof navigator !== "undefined" ? navigator.languages : undefined
    );
  }
  if (typeof mode === "string") {
    const c = toBaseLanguageCode(mode);
    if (c) return c;
  }
  return resolveBrowserLocale(
    typeof navigator !== "undefined" ? navigator.languages : undefined
  );
}

export function ConfigProvider(props = {}) {
  const { id, supportCallback, identify, options, signature, children } = props;
  const [config, setConfig] = useState(null);

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

        const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
        const normalizedQuestions = rawQuestions
          .map(normalizeSuggestedQuestionItem)
          .filter(Boolean);
        data.questions = grabQuestions(
          normalizedQuestions,
          options?.suggestedQuestions
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
          ...restOptions
        } = options || {};

        const browserLocale = resolveEffectiveBrowserLocale(options);
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

        setConfig({
          ...data,
          teamId,
          botId,
          supportCallback,
          identify: identify || {},
          signature,
          ...restOptions,
          labels: mergedLabels,
          textDirection,
        });
      })
      .catch((e) => {
        console.warn(`DOCSBOT: Error fetching config: ${e}`);
      });

    return () => {
      cancelled = true;
    };
  }, [id, config, localDev]);

  if (!config) return null;

  return (
    <ConfigContext.Provider value={{ ...config, updateIdentity }}>
      {children}
    </ConfigContext.Provider>
  );
}
