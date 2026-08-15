export const LEAD_CAPTURE_EVENT = 'docsbot_lead_capture';

export function dispatchLeadCaptureEvent(
	{ conversationId, fields = {}, metadata = {} },
	eventTarget = globalThis.document,
	CustomEventImpl = globalThis.CustomEvent
) {
	if (
		!eventTarget ||
		typeof eventTarget.dispatchEvent !== 'function' ||
		typeof CustomEventImpl !== 'function'
	) {
		return false;
	}

	eventTarget.dispatchEvent(
		new CustomEventImpl(LEAD_CAPTURE_EVENT, {
			detail: {
				conversationId: conversationId || null,
				fields: { ...fields },
				metadata: { ...metadata }
			}
		})
	);
	return true;
}
