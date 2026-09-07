// Keep the full pool across count-only updates without exposing it as an option.
export const questionPool = Symbol('questionPool');

export function normalizeQuestions(questions) {
	return questions
		.map((item) => {
			if (typeof item === 'string') {
				const value = item.trim();
				return value ? { label: value, question: value } : null;
			}
			if (!item || typeof item !== 'object') return null;
			const question =
				typeof item.question === 'string' ? item.question.trim() : '';
			const label =
				typeof item.label === 'string' ? item.label.trim() : '';
			return question || label
				? { label: label || question, question: question || label }
				: null;
		})
		.filter(Boolean);
}

export function pickQuestions(pool, limit = 3) {
	const unique = [
		...new Map(pool.map((item) => [item.question, item])).values()
	];
	for (let i = unique.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[unique[i], unique[j]] = [unique[j], unique[i]];
	}
	return unique.slice(0, Math.max(0, limit));
}

const stringKeys = new Set([
	'botName',
	'description',
	'color',
	'icon',
	'botIcon',
	'customCSS'
]);
const booleanKeys = new Set([
	'hideHeader',
	'showButtonLabel',
	'keepFooterVisible',
	'showAgentActivity'
]);
const enums = {
	theme: ['auto', 'light', 'dark'],
	alignment: ['left', 'right'],
	headerAlignment: ['left', 'center']
};
const object = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

// Validate and copy before enqueueing React state, so errors are synchronous
// and callers cannot mutate a queued update by changing their input object.
export function validateRuntimeOptions(options) {
	if (!object(options))
		throw new TypeError(
			'DocsBotAI.updateOptions expects an options object'
		);
	const patch = {};
	for (const [key, value] of Object.entries(options)) {
		let valid = false;
		if (stringKeys.has(key)) valid = typeof value === 'string';
		else if (booleanKeys.has(key)) valid = typeof value === 'boolean';
		else if (Object.hasOwn(enums, key)) valid = enums[key].includes(value);
		else if (key === 'logo')
			valid = value === null || typeof value === 'string';
		else if (key === 'horizontalMargin' || key === 'verticalMargin')
			valid = Number.isFinite(value) && value >= 0;
		else if (key === 'suggestedQuestions')
			valid = Number.isInteger(value) && value >= 0;
		else if (key === 'questions') {
			valid =
				Array.isArray(value) &&
				value.every(
					(item) =>
						(typeof item === 'string' || object(item)) &&
						normalizeQuestions([item]).length === 1
				);
			if (valid) {
				patch.questions = normalizeQuestions(value);
				continue;
			}
		} else if (key === 'labels') {
			valid =
				object(value) &&
				Object.values(value).every(
					(label) => typeof label === 'string'
				);
			if (valid) {
				patch.labels = { ...value };
				continue;
			}
		} else {
			throw new TypeError(
				`DocsBotAI.updateOptions does not support "${key}" at runtime`
			);
		}
		if (!valid)
			throw new TypeError(
				`Invalid DocsBotAI.updateOptions value for "${key}"`
			);
		patch[key] = value;
	}
	return patch;
}

export function mergeRuntimeOptions(config, patch) {
	const next = { ...config, ...patch };
	if (patch.labels) next.labels = { ...config.labels, ...patch.labels };
	if (
		Object.hasOwn(patch, 'questions') ||
		Object.hasOwn(patch, 'suggestedQuestions')
	) {
		next[questionPool] =
			patch.questions ??
			config[questionPool] ??
			normalizeQuestions(config.questions || []);
		next.questions = pickQuestions(
			next[questionPool],
			next.suggestedQuestions
		);
	}
	return next;
}
