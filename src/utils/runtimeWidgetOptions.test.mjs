import assert from 'node:assert/strict';
import test from 'node:test';
import {
	normalizeQuestions,
	pickQuestions,
	questionPool,
	validateRuntimeOptions,
	mergeRuntimeOptions
} from './runtimeWidgetOptions.mjs';

const apply = (config, patch) =>
	mergeRuntimeOptions(config, validateRuntimeOptions(patch));
test('partial updates preserve unrelated settings and merge labels without mutating inputs', () => {
	const config = {
		labels: { firstMessage: 'Hello', send: 'Send' },
		identify: { name: 'Aaron' },
		questions: ['Old'],
		signature: 'token'
	};
	const next = apply(config, { labels: { send: 'Go' }, theme: 'dark' });
	assert.deepEqual(next.labels, { firstMessage: 'Hello', send: 'Go' });
	assert.equal(next.identify, config.identify);
	assert.equal(next.signature, 'token');
	assert.equal(next.questions, config.questions);
	assert.equal(config.labels.send, 'Send');
});
test('question replacements normalize, deduplicate and retain the pool for count changes', () => {
	const initial = apply(
		{},
		{
			questions: [' A ', { label: 'B label', question: 'B' }, 'A', 'C'],
			suggestedQuestions: 1
		}
	);
	assert.equal(initial.questions.length, 1);
	const expanded = apply(initial, { suggestedQuestions: 10 });
	assert.deepEqual(
		new Set(expanded.questions.map((q) => q.question)),
		new Set(['A', 'B', 'C'])
	);
	assert.equal(
		expanded.questions.find((q) => q.question === 'B').label,
		'B label'
	);
	assert.equal(
		apply(expanded, { suggestedQuestions: 0 }).questions.length,
		0
	);
	const cleared = apply(expanded, { questions: [] });
	assert.deepEqual(apply(cleared, { suggestedQuestions: 3 }).questions, []);
	assert.equal(initial[questionPool].length, 4);
});
test('unrelated updates never reshuffle suggestions; queued inputs are copied', () => {
	const input = {
		questions: [{ label: 'A', question: 'Alpha' }],
		labels: { send: 'Go' }
	};
	const patch = validateRuntimeOptions(input);
	input.questions[0].question = 'Changed';
	input.labels.send = 'Changed';
	const config = mergeRuntimeOptions({}, patch);
	assert.equal(config.questions[0].question, 'Alpha');
	assert.equal(config.labels.send, 'Go');
	assert.equal(apply(config, { botName: 'New' }).questions, config.questions);
});
test('invalid and unsupported patches fail atomically', () => {
	for (const patch of [
		null,
		[],
		{ isAgent: true },
		{ signature: 'token' },
		{ allowedDomains: [] },
		{ locale: 'ja' },
		{ questions: null },
		{ questions: [''] },
		{ suggestedQuestions: -1 },
		{ suggestedQuestions: 1.5 },
		{ labels: { send: null } },
		{ theme: 'invalid' },
		{ color: 3 },
		{ horizontalMargin: Infinity },
		{ botName: 'Valid', useVoiceAgent: true }
	]) {
		assert.throws(() => validateRuntimeOptions(patch), TypeError);
	}
	assert.deepEqual(validateRuntimeOptions({}), {});
});
test('normalization handles server data and selection terminates with duplicates', () => {
	const pool = normalizeQuestions([null, '', ' A ', { label: 'B' }, {}, 'A']);
	assert.equal(pickQuestions(pool, 100).length, 2);
	assert.equal(pickQuestions(pool, 0).length, 0);
});
