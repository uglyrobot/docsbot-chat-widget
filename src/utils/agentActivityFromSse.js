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
		const payload = parseToolCallPayload(rawData);
		const name = (payload && payload.name) || '';
		const openAiKind = openAiBuiltinToolKind(name);
		if (openAiKind === 'web_search') {
			const webSearchMeta = parseWebSearchToolCallParams(payload?.params);
			return {
				kind: 'web_search',
				configKey: 'agentActivityWebSearch',
				...webSearchMeta
			};
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
		if (bookingToolActivityKind(name)) {
			return { kind: 'booking', configKey: 'agentActivityTool' };
		}
		return { kind: 'tool', configKey: 'agentActivityTool' };
	}

	return null;
}

function parseWebSearchToolCallParams(rawParams) {
	let parsed = rawParams;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			parsed = null;
		}
	}
	if (!parsed || typeof parsed !== 'object') {
		return {};
	}

	const actionType = normalizeActionType(
		parsed.action_type || parsed.action?.type
	);
	const query = firstNonEmptyString(
		parsed.query,
		parsed.action?.query,
		Array.isArray(parsed.queries) ? parsed.queries[0] : '',
		Array.isArray(parsed.action?.queries) ? parsed.action.queries[0] : ''
	);
	const url = firstNonEmptyString(parsed.action?.url, parsed.url);
	const pattern = firstNonEmptyString(
		parsed.action?.pattern,
		parsed.pattern
	);

	return {
		webSearchActionType: actionType,
		webSearchQuery: query || '',
		webSearchUrl: url || '',
		webSearchPattern: pattern || ''
	};
}

function firstNonEmptyString(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

function normalizeActionType(value) {
	if (typeof value !== 'string') return '';
	const normalized = value.trim().toLowerCase();
	if (
		normalized === 'search' ||
		normalized === 'open_page' ||
		normalized === 'find_in_page'
	) {
		return normalized;
	}
	return '';
}

export function parseToolCallPayload(rawData) {
	let payload = rawData;
	if (typeof payload === 'string') {
		try {
			payload = JSON.parse(payload);
		} catch {
			payload = { name: '', params: '' };
		}
	}
	return payload && typeof payload === 'object'
		? payload
		: { name: '', params: '' };
}

export function isCalendlyToolCallName(name) {
	return typeof name === 'string' && /calendly/i.test(name);
}

export function isCalComToolCallName(name) {
	return typeof name === 'string' && /cal(?:\.|_)?com/i.test(name);
}

export function isTidyCalToolCallName(name) {
	return typeof name === 'string' && /tidycal/i.test(name);
}

/** Stripe tool names → config label key (translations). Unmapped stripe_* falls through to generic tool. */
const STRIPE_TOOL_CONFIG_KEYS = {
	stripe_recent_invoices: 'agentActivityStripeRecentInvoices',
	stripe_customer_subscriptions: 'agentActivityStripeCustomerSubscriptions',
	stripe_billing_portal: 'agentActivityStripeBillingPortal',
	stripe_refund_latest_payment: 'agentActivityStripeRefundLatestPayment',
	stripe_cancel_subscription: 'agentActivityStripeCancelSubscription'
};

function stripeToolConfigKey(name) {
	return name && STRIPE_TOOL_CONFIG_KEYS[name] || null;
}

function bookingToolActivityKind(name) {
	return typeof name === 'string' && /^book_/i.test(name);
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
