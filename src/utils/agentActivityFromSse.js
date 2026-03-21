/**
 * Chat Agent SSE `data` field shapes (during AgentGraph.astream):
 *
 * - reasoning: JSON string `{"text":"..."}` — model reasoning summary
 * - tool_call: JSON string `{"name":"<tool>","params":"<json string>"}` — one per
 *   invocation; e.g. `search_documentation`, `stripe_*`, escalation tools, etc.
 *   `params` is a nested JSON string (may be filtered for streaming).
 * - stream: plain text token (not JSON) — handled in Chatbot.jsx, not here
 *
 * @returns {{ kind: string, label?: string, configKey?: string } | null}
 */
export function agentActivityFromSseEvent(eventName, rawData) {
	if (eventName === 'reasoning') {
		let parsed = rawData;
		if (typeof parsed === 'string') {
			try {
				parsed = JSON.parse(parsed);
			} catch {
				parsed = { text: parsed };
			}
		}
		const text =
			parsed && typeof parsed === 'object' && parsed.text != null
				? String(parsed.text)
				: '';
		const trimmed = text.replace(/\*\*/g, '').trim();
		if (!trimmed) {
			return { kind: 'reasoning', configKey: 'agentActivityThinking' };
		}
		const label = formatReasoningLabel(text);
		return { kind: 'reasoning', label };
	}

	if (eventName === 'tool_call') {
		let payload = rawData;
		if (typeof payload === 'string') {
			try {
				payload = JSON.parse(payload);
			} catch {
				payload = { name: '', params: '' };
			}
		}
		const name = (payload && payload.name) || '';
		const openAiKind = openAiBuiltinToolKind(name);
		if (openAiKind === 'web_search') {
			return { kind: 'web_search', configKey: 'agentActivityWebSearch' };
		}
		if (openAiKind === 'code_interpreter') {
			return { kind: 'code_interpreter', configKey: 'agentActivityCodeInterpreter' };
		}
		const stripeKey = stripeToolConfigKey(name);
		if (stripeKey) {
			return { kind: 'stripe', configKey: stripeKey };
		}
		if (name === 'search_documentation') {
			return { kind: 'search_docs', configKey: 'agentActivitySearchDocumentation' };
		}
		return { kind: 'tool', configKey: 'agentActivityTool' };
	}

	return null;
}

/** Stripe tool names → config label key (translations). Unmapped stripe_* falls through to generic tool. */
const STRIPE_TOOL_CONFIG_KEYS = {
	stripe_recent_invoices_and_subscriptions:
		'agentActivityStripeRecentInvoicesAndSubscriptions',
	stripe_billing_portal: 'agentActivityStripeBillingPortal',
	stripe_refund_latest_payment: 'agentActivityStripeRefundLatestPayment',
	stripe_cancel_subscription: 'agentActivityStripeCancelSubscription'
};

function stripeToolConfigKey(name) {
	return name && STRIPE_TOOL_CONFIG_KEYS[name] || null;
}

/** Maps OpenAI Responses / tools naming to widget activity kinds (labels from bot config). */
function openAiBuiltinToolKind(name) {
	if (!name) return null;
	if (
		name === 'web_search' ||
		name === 'web_search_call' ||
		name === 'web_search_preview'
	) {
		return 'web_search';
	}
	if (name === 'code_interpreter' || name === 'code_interpreter_call') {
		return 'code_interpreter';
	}
	return null;
}

function formatReasoningLabel(text) {
	const t = String(text).replace(/\*\*/g, '').trim();
	if (!t) return '';
	const line = t.split(/\n+/).find((l) => l.trim()) || t;
	const one = line.trim();
	return one.length > 140 ? `${one.slice(0, 137)}…` : one;
}

