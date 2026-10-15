const LIBRARY_VERSION = '1.0.0'
const SPEC_SHA256 = 'ba70f60f9bd97423254845af800e777292a62abce5256cf9f3c48ca4275f5311'
const ALLOWED_COMPONENTS = new Set([
	'Stack',
	'TextBlock',
	'Callout',
	'Metric',
	'BulletList',
	'DataTable'
])

export function cleanGenerativeUiPayload(payload) {
	if (
		!payload ||
		payload.libraryVersion !== LIBRARY_VERSION ||
		payload.specSha256 !== SPEC_SHA256 ||
		typeof payload.response !== 'string'
	) return null

	const response = payload.response.trim()
	if (
		!response ||
		new TextEncoder().encode(response).length > 16000 ||
		response.split('\n').filter((line) => line.trim()).length > 80 ||
		!/^root\s*=\s*Stack\s*\(/.test(response) ||
		/@|<|>|javascript:|<script|<iframe|^```/im.test(response)
	) return null

	const calls = [...response.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*\(/g)]
	if (!calls.length || calls.some((match) => !ALLOWED_COMPONENTS.has(match[1]))) {
		return null
	}
	return { ...payload, response }
}
