const SAFE_EXTERNAL_ACTION_PROTOCOLS = new Set([
	'http:',
	'https:',
	'mailto:',
	'tel:'
]);

export function sanitizeExternalActionUrl(value) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (!trimmed) return '';

	try {
		const url = new URL(trimmed);
		return SAFE_EXTERNAL_ACTION_PROTOCOLS.has(url.protocol.toLowerCase())
			? trimmed
			: '';
	} catch {
		return '';
	}
}
