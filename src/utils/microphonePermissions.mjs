export function isMicrophoneDisallowedByEmbeddedPagePolicy(
	documentRef = globalThis.document
) {
	if (!documentRef) return false;
	const policy =
		documentRef.permissionsPolicy || documentRef.featurePolicy;
	if (!policy || typeof policy.allowsFeature !== 'function') {
		return false;
	}
	try {
		return policy.allowsFeature('microphone') === false;
	} catch {
		return false;
	}
}

export function errorSuggestsMicrophoneBlockedByPermissionsPolicy(error) {
	const message = String(error?.message || '').toLowerCase();
	return (
		message.includes('permissions policy') ||
		message.includes('not allowed in this document')
	);
}

export function isMicrophoneBlockedByPermissionsPolicy(
	error,
	documentRef = globalThis.document
) {
	return (
		isMicrophoneDisallowedByEmbeddedPagePolicy(documentRef) ||
		errorSuggestsMicrophoneBlockedByPermissionsPolicy(error)
	);
}
