import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeExternalActionUrl } from './externalActionUrl.mjs';

test('external action URLs allow supported absolute protocols', () => {
	assert.equal(
		sanitizeExternalActionUrl(' https://example.com/account '),
		'https://example.com/account'
	);
	assert.equal(
		sanitizeExternalActionUrl('mailto:support@example.com'),
		'mailto:support@example.com'
	);
	assert.equal(sanitizeExternalActionUrl('tel:+15551234567'), 'tel:+15551234567');
});

test('external action URLs reject executable and relative URLs', () => {
	assert.equal(sanitizeExternalActionUrl('javascript:alert(1)'), '');
	assert.equal(sanitizeExternalActionUrl('data:text/html,<script>alert(1)</script>'), '');
	assert.equal(sanitizeExternalActionUrl('/relative/path'), '');
	assert.equal(sanitizeExternalActionUrl(''), '');
});
