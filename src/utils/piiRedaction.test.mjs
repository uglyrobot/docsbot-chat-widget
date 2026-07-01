import assert from "node:assert/strict";
import test from "node:test";
import {
	canUseRampartInBrowser,
	createPiiRedactionSessionStorageEnvelope,
	getPiiRedactionSessionStorageKey,
	isPiiRedactionEnabled,
	normalizePiiRedactionConfig,
	readPiiRedactionSessionStorageEnvelope,
	resolveEffectivePiiRedactionConfig,
	resolveDefaultRampartModelRootUrl,
	resolveDefaultRampartModelUrl,
	resolveDefaultRampartRuntimeRootUrl,
	resolveDefaultRampartRuntimeUrl,
} from "./piiRedaction.mjs";

test("normalizes pii redaction option", () => {
	assert.deepEqual(normalizePiiRedactionConfig(true), { enabled: true });
	assert.deepEqual(normalizePiiRedactionConfig(false), { enabled: false });
	assert.deepEqual(normalizePiiRedactionConfig(null), { enabled: false });
	assert.deepEqual(normalizePiiRedactionConfig({}), { enabled: true });
	assert.deepEqual(normalizePiiRedactionConfig({ enabled: false }), {
		enabled: false,
	});
	assert.equal(isPiiRedactionEnabled({ device: "wasm" }), true);
});

test("serializes pii redaction sessions in a versioned local envelope", () => {
	const session = {
		forward: [["EMAIL:jane@example.com", "[EMAIL_1]"]],
		reverse: [["[EMAIL_1]", "jane@example.com"]],
		counters: [["EMAIL", 1]],
	};
	const envelope = createPiiRedactionSessionStorageEnvelope(session);

	assert.equal(envelope.version, 1);
	assert.equal(typeof envelope.updatedAt, "number");
	assert.deepEqual(readPiiRedactionSessionStorageEnvelope(envelope), session);
	assert.equal(readPiiRedactionSessionStorageEnvelope(null), null);
	assert.equal(
		readPiiRedactionSessionStorageEnvelope({
			version: 999,
			session,
		}),
		null
	);
});

test("scopes pii redaction session storage by bot and conversation", () => {
	assert.equal(
		getPiiRedactionSessionStorageKey("bot_123", "conversation_456"),
		"DocsBot_bot_123_piiRedactionSession_conversation_456"
	);
	assert.equal(getPiiRedactionSessionStorageKey("", "conversation_456"), "");
	assert.equal(getPiiRedactionSessionStorageKey("bot_123", ""), "");
});

test("resolves effective pii redaction config from API with disable-only embed override", () => {
	assert.equal(resolveEffectivePiiRedactionConfig(false, true), false);
	assert.equal(resolveEffectivePiiRedactionConfig(undefined, true), undefined);
	assert.deepEqual(
		resolveEffectivePiiRedactionConfig({ enabled: true, model: "api" }, true),
		{ enabled: true, model: "api" }
	);
	assert.equal(
		resolveEffectivePiiRedactionConfig({ enabled: true }, false),
		false
	);
	assert.equal(
		resolveEffectivePiiRedactionConfig({ enabled: true }, { enabled: false }),
		false
	);
});

test("allows embed pii redaction override in local dev", () => {
	assert.equal(
		resolveEffectivePiiRedactionConfig(false, true, { localDev: true }),
		true
	);
	assert.deepEqual(
		resolveEffectivePiiRedactionConfig(
			undefined,
			{ enabled: true, heuristicsOnly: true },
			{ localDev: true }
		),
		{ enabled: true, heuristicsOnly: true }
	);
	assert.equal(
		resolveEffectivePiiRedactionConfig({ enabled: true }, false, {
			localDev: true,
		}),
		false
	);
});

test("detects browser runtime requirements", () => {
	const previousWindow = globalThis.window;
	try {
		delete globalThis.window;
		assert.equal(canUseRampartInBrowser(), false);
	} finally {
		if (previousWindow === undefined) {
			delete globalThis.window;
		} else {
			globalThis.window = previousWindow;
		}
	}
});

test("resolves the default model URL beside chat.js", () => {
	const previousDocument = globalThis.document;
	const previousWindow = globalThis.window;
	try {
		globalThis.window = {
			location: { origin: "https://example.com" },
		};
		globalThis.document = {
			currentScript: {
				src: "https://widget.docsbot.ai/chat.js",
			},
			getElementsByTagName: () => [],
		};

		assert.equal(
			resolveDefaultRampartModelUrl(),
			"https://widget.docsbot.ai/rampart-model/"
		);
		assert.equal(
			resolveDefaultRampartModelRootUrl(),
			"https://widget.docsbot.ai/"
		);
		assert.equal(
			resolveDefaultRampartRuntimeUrl(),
			"https://widget.docsbot.ai/rampart-runtime/index.js"
		);
		assert.equal(
			resolveDefaultRampartRuntimeRootUrl(),
			"https://widget.docsbot.ai/rampart-runtime/"
		);
	} finally {
		if (previousDocument === undefined) {
			delete globalThis.document;
		} else {
			globalThis.document = previousDocument;
		}
		if (previousWindow === undefined) {
			delete globalThis.window;
		} else {
			globalThis.window = previousWindow;
		}
	}
});
