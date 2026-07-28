import assert from 'node:assert/strict';
import test from 'node:test';
import {
	errorSuggestsMicrophoneBlockedByPermissionsPolicy,
	isMicrophoneBlockedByPermissionsPolicy,
	isMicrophoneDisallowedByEmbeddedPagePolicy
} from './microphonePermissions.mjs';

test('detects microphone denial from modern and legacy document policy APIs', () => {
	assert.equal(
		isMicrophoneDisallowedByEmbeddedPagePolicy({
			permissionsPolicy: {
				allowsFeature: (feature) => feature !== 'microphone'
			}
		}),
		true
	);
	assert.equal(
		isMicrophoneDisallowedByEmbeddedPagePolicy({
			featurePolicy: { allowsFeature: () => true }
		}),
		false
	);
});

test('detects browser policy error messages without treating user denial as policy denial', () => {
	assert.equal(
		errorSuggestsMicrophoneBlockedByPermissionsPolicy({
			message: 'Permissions policy blocks microphone access'
		}),
		true
	);
	assert.equal(
		isMicrophoneBlockedByPermissionsPolicy(
			{ name: 'NotAllowedError', message: 'Permission denied' },
			{}
		),
		false
	);
	assert.equal(
		isMicrophoneBlockedByPermissionsPolicy(
			{ message: 'Microphone is not allowed in this document' },
			{}
		),
		true
	);
});
