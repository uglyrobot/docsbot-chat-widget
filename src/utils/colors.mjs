function clampChannel(value) {
	return Math.min(255, Math.max(0, Number(value)));
}

export function parseColor(color) {
	if (typeof color !== 'string') return null;
	const value = color.trim();

	const shortHex = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
	if (shortHex) {
		return shortHex.slice(1).map((channel) => parseInt(`${channel}${channel}`, 16));
	}

	const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i);
	if (hex) {
		return hex.slice(1, 4).map((channel) => parseInt(channel, 16));
	}

	const rgb = value.match(
		/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/
	);
	if (rgb) {
		return rgb.slice(1, 4).map(clampChannel);
	}

	return null;
}

function relativeLuminance(color) {
	const rgb = Array.isArray(color) ? color : parseColor(color);
	if (!rgb) return null;
	const [r, g, b] = rgb.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(firstColor, secondColor) {
	const first = relativeLuminance(firstColor);
	const second = relativeLuminance(secondColor);
	if (first === null || second === null) return 1;
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

export function decideTextColor(color) {
	const background = parseColor(color);
	if (!background) return '#ffffff';

	const [r, g, b] = background;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	if (luminance > 0.6) {
		return `rgb(${Math.floor(r * 0.4)},${Math.floor(g * 0.4)},${Math.floor(
			b * 0.4
		)})`;
	}

	return '#fff';
}

export function decideAccessibleTextColor(color) {
	const background = parseColor(color);
	if (!background) return '#ffffff';

	const lightText = '#ffffff';
	const darkText = '#000000';
	const lightContrast = getContrastRatio(background, lightText);
	const darkContrast = getContrastRatio(background, darkText);

	return darkContrast >= lightContrast ? darkText : lightText;
}

export function decideBrandForeground(color, minimumContrast = 3) {
	const background = parseColor(color);
	if (!background) return '#ffffff';
	return getContrastRatio(background, '#ffffff') >= minimumContrast
		? '#ffffff'
		: '#000000';
}

function mixColor(rgb, target, amount) {
	return rgb.map((channel, index) =>
		Math.round(channel + (target[index] - channel) * amount)
	);
}

function rgbString(rgb) {
	return `rgb(${rgb.map((channel) => Math.round(channel)).join(',')})`;
}

function srgbChannelToLinear(channel) {
	const normalized = channel / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(channel) {
	const clamped = Math.min(1, Math.max(0, channel));
	const normalized =
		clamped <= 0.0031308
			? 12.92 * clamped
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	return Math.round(normalized * 255);
}

function rgbToOklch(rgb) {
	const [red, green, blue] = rgb.map(srgbChannelToLinear);
	const l = Math.cbrt(
		0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
	);
	const m = Math.cbrt(
		0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
	);
	const s = Math.cbrt(
		0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
	);
	const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const chroma = Math.sqrt(a * a + b * b);
	const hue = chroma < 0.0001 ? 0 : Math.atan2(b, a);
	return [lightness, chroma, hue];
}

function oklchToRgb([lightness, chroma, hue]) {
	const a = chroma * Math.cos(hue);
	const b = chroma * Math.sin(hue);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		linearChannelToSrgb(
			4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
		),
		linearChannelToSrgb(
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
		),
		linearChannelToSrgb(
			-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
		)
	];
}

export function mixColors(color, backgroundColor, colorWeight = 0.72) {
	const foreground = parseColor(color);
	const background = parseColor(backgroundColor);
	if (!foreground || !background) return color;
	const weight = Math.min(1, Math.max(0, colorWeight));
	return rgbString(
		foreground.map((channel, index) =>
			Math.round(channel * weight + background[index] * (1 - weight))
		)
	);
}

export function deriveDarkBrandSurface(
	color,
	backgroundColor = '#111827',
	colorWeight = 0.28
) {
	const foreground = parseColor(color);
	const background = parseColor(backgroundColor);
	if (!foreground || !background) return color;

	const weight = Math.min(0.35, Math.max(0.2, colorWeight));
	const [brandLightness, brandChroma, brandHue] = rgbToOklch(foreground);
	const [surfaceLightness, surfaceChroma, surfaceHue] =
		rgbToOklch(background);
	const hasBrandHue = brandChroma >= 0.02;
	const hue = hasBrandHue ? brandHue : surfaceHue;
	const lightness = Math.min(
		0.44,
		Math.max(
			0.3,
			surfaceLightness * (1 - weight) + brandLightness * weight
		)
	);
	const chroma = Math.min(
		0.1,
		surfaceChroma * (1 - weight) + Math.min(brandChroma, 0.24) * weight
	);

	return rgbString(oklchToRgb([lightness, chroma, hue]));
}

export function getContrastSafeAccent(
	color,
	backgroundColor,
	minimumContrast = 3
) {
	return getContrastSafeAccentForSurfaces(
		color,
		[backgroundColor],
		minimumContrast
	);
}

export function getContrastSafeAccentForSurfaces(
	color,
	backgroundColors,
	minimumContrast = 3
) {
	const foreground = parseColor(color);
	const backgrounds = (Array.isArray(backgroundColors)
		? backgroundColors
		: [backgroundColors]
	)
		.map(parseColor)
		.filter(Boolean);
	if (!foreground || backgrounds.length === 0) return color;
	const meetsContrast = (candidate) =>
		backgrounds.every(
			(background) =>
				getContrastRatio(candidate, background) >= minimumContrast
		);
	if (meetsContrast(foreground)) {
		return color;
	}

	const black = [0, 0, 0];
	const white = [255, 255, 255];
	const worstContrast = (candidate) =>
		Math.min(
			...backgrounds.map((background) =>
				getContrastRatio(candidate, background)
			)
		);
	const target = worstContrast(black) >= worstContrast(white) ? black : white;

	for (let step = 1; step <= 100; step += 1) {
		const candidate = mixColor(foreground, target, step / 100);
		if (meetsContrast(candidate)) {
			return rgbString(candidate);
		}
	}

	return rgbString(target);
}

export function getLighterColor(color, factor = 0.8) {
	const rgb = parseColor(color);
	if (!rgb) throw new Error('Unsupported color format');
	const amount = Math.min(1, Math.max(0, factor));
	const [r, g, b] = rgb.map((channel) =>
		Math.min(Math.floor(channel + (255 - channel) * amount), 255)
	);
	return `rgb(${r},${g},${b})`;
}
