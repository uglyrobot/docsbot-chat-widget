import test from 'node:test';
import assert from 'node:assert/strict';
import {
	decideAccessibleTextColor,
	decideBrandForeground,
	decideTextColor,
	deriveDarkBrandSurface,
	getContrastSafeAccent,
	getContrastSafeAccentForSurfaces,
	getContrastRatio,
	getLighterColor,
	parseColor
} from './colors.mjs';

test('parseColor supports short hex, long hex, and rgb syntax', () => {
	assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
	assert.deepEqual(parseColor('#1292EE'), [18, 146, 238]);
	assert.deepEqual(parseColor('rgb(18, 146, 238)'), [18, 146, 238]);
});

test('decideTextColor preserves the existing light-theme foreground calculation', () => {
	assert.equal(decideTextColor('#ffffff'), 'rgb(102,102,102)');
	assert.equal(decideTextColor('#000000'), '#fff');
	assert.equal(decideTextColor('#1292EE'), '#fff');
});

test('decideAccessibleTextColor chooses the higher WCAG contrast foreground', () => {
	assert.equal(decideAccessibleTextColor('#ffffff'), '#000000');
	assert.equal(decideAccessibleTextColor('#000000'), '#ffffff');
	assert.equal(decideAccessibleTextColor('#1292EE'), '#000000');
	assert.ok(
		getContrastRatio(
			'#1292EE',
			decideAccessibleTextColor('#1292EE')
		) >= 4.5
	);
});

test('brand foreground prefers white when it remains readable', () => {
	assert.equal(decideBrandForeground('#1292EE'), '#ffffff');
	assert.equal(decideBrandForeground('#ffffff'), '#000000');
	assert.equal(decideBrandForeground('#fde047'), '#000000');
});

test('deriveDarkBrandSurface creates dark, branded supporting surfaces', () => {
	const background = '#111827';
	const representativeBrands = [
		'#ffffff',
		'#e5e7eb',
		'#fde047',
		'#f97316',
		'#e11d48',
		'#16a34a',
		'#1292EE',
		'#7c3aed',
		'#334155',
		'#0b0f19'
	];

	for (const brand of representativeBrands) {
		const toned = deriveDarkBrandSurface(brand, background);
		assert.notEqual(toned, brand);
		assert.ok(
			getContrastRatio(toned, background) >= 1.25,
			`Expected ${brand} surface ${toned} to remain distinct from dark mode`
		);
		assert.ok(
			getContrastRatio(toned, decideAccessibleTextColor(toned)) >= 4.5,
			`Expected readable text on ${brand} surface ${toned}`
		);
		assert.ok(
			getContrastRatio(toned, background) <= 3,
			`Expected ${brand} surface ${toned} to stay predominantly dark`
		);
	}
});

test('deriveDarkBrandSurface clamps the supported brand contribution range', () => {
	assert.equal(
		deriveDarkBrandSurface('#1292EE', '#111827', 0.01),
		deriveDarkBrandSurface('#1292EE', '#111827', 0.2)
	);
	assert.equal(
		deriveDarkBrandSurface('#1292EE', '#111827', 0.9),
		deriveDarkBrandSurface('#1292EE', '#111827', 0.35)
	);
});

test('getContrastSafeAccent preserves usable brand colors and adjusts pale ones', () => {
	assert.equal(getContrastSafeAccent('#1292EE', '#ffffff'), '#1292EE');
	const adjusted = getContrastSafeAccent('#ffffff', '#ffffff');
	assert.notEqual(adjusted, '#ffffff');
	assert.ok(getContrastRatio(adjusted, '#ffffff') >= 3);
	assert.equal(getContrastSafeAccent('#ffffff', '#111827'), '#ffffff');
});

test('accent variants meet contrast across every themed surface', () => {
	const lightAccent = getContrastSafeAccentForSurfaces(
		'#1292EE',
		['#ffffff', '#f8fafc', '#f1f3f5'],
		4.5
	);
	for (const surface of ['#ffffff', '#f8fafc', '#f1f3f5']) {
		assert.ok(getContrastRatio(lightAccent, surface) >= 4.5);
	}

	const darkAccent = getContrastSafeAccentForSurfaces(
		'#7c3aed',
		['#111827', '#1f2937', '#182231', '#263244'],
		4.5
	);
	for (const surface of ['#111827', '#1f2937', '#182231', '#263244']) {
		assert.ok(getContrastRatio(darkAccent, surface) >= 4.5);
	}

	for (const [brand, surfaces] of [
		['rgb(34,34,17)', ['#111827', '#1f2937', '#182231', '#263244']],
		['#ffffff', ['#ffffff', '#f8fafc', '#f1f3f5']]
	]) {
		const fill = getContrastSafeAccentForSurfaces(brand, surfaces, 3);
		assert.ok(
			getContrastRatio(fill, decideAccessibleTextColor(fill)) >= 4.5
		);
	}
});

test('getLighterColor preserves the existing rgb contract', () => {
	assert.equal(getLighterColor('#000000', 0.5), 'rgb(127,127,127)');
});

test('decideAccessibleTextColor guarantees 4.5 contrast across a representative RGB grid', () => {
	for (let red = 0; red <= 255; red += 17) {
		for (let green = 0; green <= 255; green += 17) {
			for (let blue = 0; blue <= 255; blue += 17) {
				const background = `rgb(${red},${green},${blue})`;
				assert.ok(
					getContrastRatio(
						background,
						decideAccessibleTextColor(background)
					) >= 4.5,
					`Expected accessible foreground for ${background}`
				);
			}
		}
	}
});
