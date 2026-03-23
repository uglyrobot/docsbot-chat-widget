import { createContext, useContext, useEffect, useState } from "react";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

/**
 * Default English strings for `labels` (merged with bot API + widget `options.labels`).
 *
 * Chat Agent activity line (`tool_call` → agentActivity), configurable per bot/widget:
 * - agentActivityThinking — reasoning with empty text (default "Thinking…")
 * - agentActivityTool — generic fallback for unknown tools (default "Working…")
 * - agentActivitySearchDocumentation — DocsBot search (default "Searching documentation…")
 * - agentActivityWebSearch — OpenAI web search (default "Searching the web…")
 * - agentActivityCodeInterpreter — OpenAI Code Interpreter (default "Running code…")
 * Stripe tools (agent graph):
 * - agentActivityStripeRecentInvoicesAndSubscriptions — stripe_recent_invoices_and_subscriptions
 * - agentActivityStripeBillingPortal — stripe_billing_portal
 * - agentActivityStripeRefundLatestPayment — stripe_refund_latest_payment
 * - agentActivityStripeCancelSubscription — stripe_cancel_subscription
 *
 * Visibility (remote widget JSON and/or `DocsBotAI` `options`; options win on merge):
 * - showAgentActivity — optional boolean; default true when omitted. Set `false` to hide the status line above the agent reply.
 */
const defaultLabels = {
  poweredBy: "Powered by",
  inputPlaceholder: "Send a message...",
  firstMessage: "What can I help you with?",
  sources: "Sources",
  helpful: "Rate as helpful",
  unhelpful: "Rate as unhelpful",
  getSupport: "Contact support",
  floatingButton: "Help",
  suggestions: "Not sure what to ask?",
  close: "Close",
  create: "Create your own!",
  submit: "Submit",
  cancel: "Cancel",
  rateLimitMessage: "You are sending messages too fast. Please slow down.",
  leadCollectMessage: "Before we continue, could you share a few details?",
  requiredField: "Please fill out required fields.",
  continue: "Continue",
  leadCollectEmpty: "No fields configured.",
  selectOption: "Select an option",
  feedbackMessage: "Was this answer helpful?",
  feedbackYes: "Yes",
  feedbackNo: "No",
  resetChat: "Reset conversation",
  footerMessage: "",
  copyResponse: "Copy response",
  copied: "Copied!",
  agentActivityThinking: "Thinking…",
  agentActivityTool: "Working…",
  agentActivitySearchDocumentation: "Searching documentation…",
  agentActivityWebSearch: "Searching the web…",
  agentActivityCodeInterpreter: "Running code…",
  agentActivityStripeRecentInvoicesAndSubscriptions: "Fetching account data…",
  agentActivityStripeBillingPortal: "Creating billing portal link…",
  agentActivityStripeRefundLatestPayment: "Processing refund…",
  agentActivityStripeCancelSubscription: "Processing cancellation…",
}

function normalizeSuggestedQuestionItem(item) {
  if (typeof item === 'string') {
    const s = item.trim()
    return s ? { label: s, question: s } : null
  }
  if (item && typeof item === 'object') {
    const question = typeof item.question === 'string' ? item.question.trim() : ''
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    const q = question || label
    const l = label || question
    return q ? { label: l, question: q } : null
  }
  return null
}

const grabQuestions = (questions, limit = 3) => {
  if (!questions?.length) return []

  const cap = Math.min(limit, questions.length)
  const picked = []
  const seen = new Set()
  let guard = 0
  const maxGuard = cap * questions.length * 8 + questions.length

  while (picked.length < cap && guard < maxGuard) {
    guard++
    const randomIndex = Math.floor(Math.random() * questions.length)
    const item = questions[randomIndex]
    const key = item.question
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(item)
  }

  return picked
}

export function ConfigProvider(props = {}) {
  const { id, supportCallback, identify, options, signature, children } = props;
  const [config, setConfig] = useState(null);

  // update the identify object metadata in the config context. Called from lead collection tool response
  const updateIdentity = (data) => {
    setConfig((prevConfig) => {
      const nextIdentify = {
        ...prevConfig.identify,
        ...(data && typeof data === 'object' ? data : {})
      }

      if (data && typeof data === 'object' && data.metadata && typeof data.metadata === 'object') {
        Object.assign(nextIdentify, data.metadata)
        delete nextIdentify.metadata
      }

      return {
        ...prevConfig,
        identify: nextIdentify
      }
    })
  }

  const localDev = options?.localDev;

  useEffect(() => {
    if (id && !config) {
      const baseUrl = localDev ? 'http://localhost:3000/api' : 'https://docsbot.ai/api';
      const apiUrl = `${baseUrl}/widget/${id}`;
      const [teamId, botId] = props.id.split('/');

      fetch(apiUrl, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          const rawQuestions = Array.isArray(data.questions) ? data.questions : []
          const normalizedQuestions = rawQuestions
            .map(normalizeSuggestedQuestionItem)
            .filter(Boolean)
          data.questions = grabQuestions(normalizedQuestions, options?.suggestedQuestions)

          //check that current domain is in the list of allowed domains
          if (data.allowedDomains && data.allowedDomains.length > 0) {
            const currentDomain = window.location.hostname
            const allowedDomains = data.allowedDomains.map(domain => domain.toLowerCase())
            //always allow:
            allowedDomains.push('localhost')
            allowedDomains.push('docsbot.ai')

            if (!allowedDomains.includes(currentDomain.toLowerCase())) {
              console.warn(`DOCSBOT: Current domain (${currentDomain}) is not in the list of allowed domains (${allowedDomains.join(', ')})`)
              return
            }
          }

          // Create a clean copy of options without the labels property. No overwriting of branding or allowedDomains (security measure).
          const { labels: optionsLabels, branding, allowedDomains: optionsAllowedDomains, ...restOptions } = options || {};
          
          // Merge labels ensuring undefined values in options.labels use defaults from data.labels
          const mergedLabels = optionsLabels
            ? { ...defaultLabels, ...data.labels, ...Object.entries(optionsLabels).reduce((acc, [key, value]) => {
                if (value !== undefined) {
                  acc[key] = value;
                }
                return acc;
              }, {}) }
            : { ...defaultLabels, ...data.labels };

          setConfig({ 
            ...data, 
            teamId,
            botId,
            supportCallback, 
            identify: identify || {}, 
            signature,
            ...restOptions,
            labels: mergedLabels
            // allowedDomains is intentionally not included from restOptions - it can only come from API response for security
          });
        })
        .catch((e) => {
          console.warn(`DOCSBOT: Error fetching config: ${e}`);
        });
    }
  }, [id, config, localDev]);

  if (!config) return null;

  return (
    <ConfigContext.Provider value={{ ...config, updateIdentity }}>{children}</ConfigContext.Provider>
  );
}
