import test from 'node:test';
import assert from 'node:assert/strict';
import {
	getWidgetThemePalette,
	normalizeWidgetTheme,
	resolveWidgetTheme,
	resolveWidgetThemePreference
} from './widgetTheme.mjs';

test('normalizeWidgetTheme accepts supported modes case-insensitively', () => {
	assert.equal(normalizeWidgetTheme(' AUTO '), 'auto');
	assert.equal(normalizeWidgetTheme('Light'), 'light');
	assert.equal(normalizeWidgetTheme('DARK'), 'dark');
});

test('normalizeWidgetTheme falls back to light for unsupported values', () => {
	assert.equal(normalizeWidgetTheme(undefined), 'light');
	assert.equal(normalizeWidgetTheme('sepia'), 'light');
});

test('resolveWidgetTheme follows the system only in auto mode', () => {
	assert.equal(resolveWidgetTheme('auto', false), 'light');
	assert.equal(resolveWidgetTheme('auto', true), 'dark');
	assert.equal(resolveWidgetTheme('light', true), 'light');
	assert.equal(resolveWidgetTheme('dark', false), 'dark');
});

test('embed options override the API theme', () => {
	assert.equal(resolveWidgetThemePreference('dark', undefined), 'dark');
	assert.equal(resolveWidgetThemePreference('dark', 'light'), 'light');
	assert.equal(resolveWidgetThemePreference('light', 'auto'), 'auto');
	assert.equal(resolveWidgetThemePreference('dark', 'sepia'), 'dark');
	assert.equal(resolveWidgetThemePreference('light', ''), 'light');
	assert.equal(resolveWidgetThemePreference(undefined, undefined), 'light');
	assert.equal(resolveWidgetThemePreference(undefined, ''), 'light');
});

test('getWidgetThemePalette returns contrast-oriented embed colors', () => {
	assert.deepEqual(getWidgetThemePalette('dark'), {
		backgroundColor: '#111827',
		textColor: '#f8fafc',
		surfaceColor: '#1f2937',
		mutedSurfaceColor: '#182231',
		borderColor: '#374151',
		mutedTextColor: '#aebccd'
	});
	assert.equal(getWidgetThemePalette('light').backgroundColor, '#ffffff');
});
