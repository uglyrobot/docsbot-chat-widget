import assert from 'node:assert/strict';
import test from 'node:test';

import {
	dispatchLeadCaptureEvent,
	LEAD_CAPTURE_EVENT
} from './widgetDomEvents.mjs';

class FakeCustomEvent {
	constructor(type, init) {
		this.type = type;
		this.detail = init.detail;
	}
}

test('dispatchLeadCaptureEvent publishes lead fields and merged metadata', () => {
	const events = [];
	const eventTarget = {
		dispatchEvent(event) {
			events.push(event);
		}
	};

	assert.equal(
		dispatchLeadCaptureEvent(
			{
				conversationId: 'conversation-1',
				fields: {
					name: 'Ada Lovelace',
					email: 'ada@example.com'
				},
				metadata: {
					name: 'Ada Lovelace',
					email: 'ada@example.com',
					plan: 'pro'
				}
			},
			eventTarget,
			FakeCustomEvent
		),
		true
	);
	assert.equal(events.length, 1);
	assert.equal(events[0].type, LEAD_CAPTURE_EVENT);
	assert.deepEqual(events[0].detail, {
		conversationId: 'conversation-1',
		fields: {
			name: 'Ada Lovelace',
			email: 'ada@example.com'
		},
		metadata: {
			name: 'Ada Lovelace',
			email: 'ada@example.com',
			plan: 'pro'
		}
	});
});

test('dispatchLeadCaptureEvent safely skips unavailable DOM APIs', () => {
	assert.equal(
		dispatchLeadCaptureEvent(
			{ conversationId: 'conversation-1' },
			null,
			FakeCustomEvent
		),
		false
	);
	assert.equal(
		dispatchLeadCaptureEvent({ conversationId: 'conversation-1' }, {}, null),
		false
	);
});
