const TIDYCAL_SCRIPT_ID = 'docsbot-tidycal-widget-script';
export const TIDYCAL_WIDGET_SCRIPT_SRC = 'https://tidycal.com/js/embed.js';

export function resolveTidyCalPath(pathOrUrl) {
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

export function resolveTidyCalUrl(pathOrUrl) {
	const path = resolveTidyCalPath(pathOrUrl);
	return path ? `https://tidycal.com/${path}` : null;
}

export function loadTidyCalWidgetScript() {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('TidyCal widget requires a browser'));
	}
	if (window.TidyCal) {
		return Promise.resolve(window.TidyCal);
	}
	if (window.__docsbotTidyCalScriptPromise) {
		return window.__docsbotTidyCalScriptPromise;
	}

	window.__docsbotTidyCalScriptPromise = new Promise((resolve, reject) => {
		const existingScript = document.getElementById(TIDYCAL_SCRIPT_ID);
		if (existingScript) {
			existingScript.addEventListener('load', () => resolve(window.TidyCal), {
				once: true
			});
			existingScript.addEventListener(
				'error',
				() => reject(new Error('Failed to load TidyCal widget script')),
				{ once: true }
			);
			return;
		}

		const script = document.createElement('script');
		script.id = TIDYCAL_SCRIPT_ID;
		script.src = TIDYCAL_WIDGET_SCRIPT_SRC;
		script.async = true;
		script.onload = () => resolve(window.TidyCal);
		script.onerror = () =>
			reject(new Error('Failed to load TidyCal widget script'));
		document.head.appendChild(script);
	});

	return window.__docsbotTidyCalScriptPromise;
}
