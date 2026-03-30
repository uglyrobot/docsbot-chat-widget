export function resolveCalComLink(pathOrUrl) {
	if (typeof pathOrUrl !== 'string') return null;
	const trimmed = pathOrUrl.trim();
	if (!trimmed) return null;

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			const url = new URL(trimmed);
			const path = url.pathname.replace(/^\/+/, '');
			return `${path}${url.search}`;
		} catch {
			return null;
		}
	}

	return trimmed.replace(/^\/+/, '');
}

export function resolveCalComUrl(pathOrUrl) {
	const link = resolveCalComLink(pathOrUrl);
	return link ? `https://cal.com/${link}` : null;
}
