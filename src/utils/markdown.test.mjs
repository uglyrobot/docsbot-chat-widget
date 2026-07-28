import assert from 'node:assert/strict';
import test from 'node:test';
import {
	normalizeMermaidMarkdown,
	preprocessStreamdownMarkdown
} from './markdown.js';

test('normalizes one-line Mermaid fences for Streamdown', () => {
	const markdown =
		'```mermaid flowchart TD A[DocsBot] --> B[Answer questions] B --> C[Help faster] ```';

	assert.equal(
		normalizeMermaidMarkdown(markdown),
		[
			'```mermaid',
			'flowchart TD',
			'A[DocsBot] --> B[Answer questions]',
			'B --> C[Help faster]',
			'```'
		].join('\n')
	);
});

test('preserves well-formed multiline Mermaid fences', () => {
	const markdown = [
		'```mermaid',
		'flowchart LR',
		'A --> B',
		'```'
	].join('\n');

	assert.equal(normalizeMermaidMarkdown(markdown), markdown);
});

test('preprocessStreamdownMarkdown keeps math normalization outside Mermaid', () => {
	const markdown =
		'Value: $x$\n\n```mermaid flowchart LR A[One] --> B[Two] ```';
	const result = preprocessStreamdownMarkdown(markdown);

	assert.match(result, /Value: \$\$x\$\$/);
	assert.match(result, /```mermaid\nflowchart LR\nA\[One\] --> B\[Two\]\n```/);
});
