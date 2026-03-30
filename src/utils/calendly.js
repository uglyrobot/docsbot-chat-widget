const CALENDLY_SCRIPT_ID = 'docsbot-calendly-widget-script';
export const CALENDLY_WIDGET_SCRIPT_SRC =
	'https://assets.calendly.com/assets/external/widget.js';

export function resolveCalendlyUrl(pathOrUrl) {
	if (typeof pathOrUrl !== 'string') return null;
	const trimmed = pathOrUrl.trim();
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://calendly.com/${trimmed.replace(/^\/+/, '')}`;
}

export function buildCalendlyEmbedUrl(pathOrUrl, theme = {}, options = {}) {
	const resolvedUrl = resolveCalendlyUrl(pathOrUrl);
	if (!resolvedUrl) return null;

	let url;
	try {
		url = new URL(resolvedUrl);
	} catch {
		return resolvedUrl;
	}

	const primaryColor = cssColorToHex(theme.primaryColor);
	const backgroundColor = cssColorToHex(theme.backgroundColor);
	const textColor = cssColorToHex(theme.textColor);

	if (primaryColor && !url.searchParams.has('primary_color')) {
		url.searchParams.set('primary_color', primaryColor);
	}
	if (backgroundColor && !url.searchParams.has('background_color')) {
		url.searchParams.set('background_color', backgroundColor);
	}
	if (textColor && !url.searchParams.has('text_color')) {
		url.searchParams.set('text_color', textColor);
	}
	if (options.hideEventDetails) {
		url.searchParams.set('hide_event_type_details', '1');
	}
	if (options.hideCookieBanner) {
		url.searchParams.set('hide_gdpr_banner', '1');
	}

	return url.toString();
}

export function loadCalendlyWidgetScript() {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Calendly widget requires a browser'));
	}
	if (window.Calendly) {
		return Promise.resolve(window.Calendly);
	}
	if (window.__docsbotCalendlyScriptPromise) {
		return window.__docsbotCalendlyScriptPromise;
	}

	window.__docsbotCalendlyScriptPromise = new Promise((resolve, reject) => {
		const existingScript = document.getElementById(CALENDLY_SCRIPT_ID);
		if (existingScript) {
			existingScript.addEventListener(
				'load',
				() => resolve(window.Calendly),
				{ once: true }
			);
			existingScript.addEventListener(
				'error',
				() => reject(new Error('Failed to load Calendly widget script')),
				{ once: true }
			);
			return;
		}

		const script = document.createElement('script');
		script.id = CALENDLY_SCRIPT_ID;
		script.src = CALENDLY_WIDGET_SCRIPT_SRC;
		script.async = true;
		script.onload = () => resolve(window.Calendly);
		script.onerror = () =>
			reject(new Error('Failed to load Calendly widget script'));
		document.head.appendChild(script);
	});

	return window.__docsbotCalendlyScriptPromise;
}

function cssColorToHex(color) {
	if (typeof color !== 'string') return null;
	const value = color.trim();
	if (!value) return null;

	const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hexMatch) {
		const hex = hexMatch[1];
		if (hex.length === 3) {
			return hex
				.split('')
				.map((char) => `${char}${char}`)
				.join('')
				.toLowerCase();
		}
		return hex.toLowerCase();
	}

	const rgbMatch = value.match(
		/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i
	);
	if (!rgbMatch) return null;

	const channels = rgbMatch.slice(1, 4).map((channel) =>
		Math.max(0, Math.min(255, Number(channel)))
	);
	return channels
		.map((channel) => channel.toString(16).padStart(2, '0'))
		.join('');
}
