export const WIDGET_THEME_AUTO = 'auto';
export const WIDGET_THEME_LIGHT = 'light';
export const WIDGET_THEME_DARK = 'dark';

export function normalizeWidgetTheme(value) {
	if (typeof value !== 'string') return WIDGET_THEME_LIGHT;
	const normalized = value.trim().toLowerCase();
	return [WIDGET_THEME_AUTO, WIDGET_THEME_LIGHT, WIDGET_THEME_DARK].includes(
		normalized
	)
		? normalized
		: WIDGET_THEME_LIGHT;
}

export function resolveWidgetTheme(theme, systemPrefersDark = false) {
	const normalized = normalizeWidgetTheme(theme);
	if (normalized === WIDGET_THEME_AUTO) {
		return systemPrefersDark ? WIDGET_THEME_DARK : WIDGET_THEME_LIGHT;
	}
	return normalized;
}

export function resolveWidgetThemePreference(apiTheme, optionsTheme) {
	const normalizedOptions =
		typeof optionsTheme === 'string' ? optionsTheme.trim().toLowerCase() : '';
	if (
		[WIDGET_THEME_AUTO, WIDGET_THEME_LIGHT, WIDGET_THEME_DARK].includes(
			normalizedOptions
		)
	) {
		return normalizedOptions;
	}
	return normalizeWidgetTheme(apiTheme);
}

export function getWidgetThemePalette(theme) {
	if (resolveWidgetTheme(theme) === WIDGET_THEME_DARK) {
		return {
			backgroundColor: '#111827',
			textColor: '#f8fafc',
			surfaceColor: '#1f2937',
			mutedSurfaceColor: '#182231',
			borderColor: '#374151',
			mutedTextColor: '#aebccd'
		};
	}

	return {
		backgroundColor: '#ffffff',
		textColor: '#314351',
		surfaceColor: '#ffffff',
		mutedSurfaceColor: '#f8fafc',
		borderColor: '#c8d3de',
		mutedTextColor: '#64748b'
	};
}
