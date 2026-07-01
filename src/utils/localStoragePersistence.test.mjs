import assert from "node:assert/strict";
import test from "node:test";
import {
	safeSetLocalStorageJson,
	trimPersistedChatHistory,
	trimPersistedConversationMessages
} from "./localStoragePersistence.mjs";

test("trims persisted chat history to the latest half", () => {
	assert.deepEqual(
		trimPersistedChatHistory([1, 2, 3, 4]),
		[3, 4]
	);
	assert.equal(trimPersistedChatHistory([1]), null);
});

test("trims persisted conversation messages by timestamp", () => {
	assert.deepEqual(
		trimPersistedConversationMessages({
			a: { timestamp: 1, message: "old" },
			b: { timestamp: 3, message: "new" },
			c: { timestamp: 2, message: "middle" }
		}),
		{
			c: { timestamp: 2, message: "middle" },
			b: { timestamp: 3, message: "new" }
		}
	);
});

test("safeSetLocalStorageJson trims after quota errors instead of throwing", () => {
	const calls = [];
	const storage = {
		setItem(key, value) {
			calls.push({ key, value });
			if (calls.length === 1) {
				throw Object.assign(new Error("quota"), {
					name: "QuotaExceededError"
				});
			}
		},
		removeItem() {}
	};

	const result = safeSetLocalStorageJson(
		"history",
		["first", "second", "third", "fourth"],
		{
			storage,
			trim: trimPersistedChatHistory,
			onError: () => {}
		}
	);

	assert.equal(result, true);
	assert.equal(calls.length, 2);
	assert.equal(calls[1].value, JSON.stringify(["third", "fourth"]));
});

test("safeSetLocalStorageJson removes the stale key if a value cannot be trimmed", () => {
	let removedKey = null;
	const storage = {
		setItem() {
			throw Object.assign(new Error("quota"), {
				name: "QuotaExceededError"
			});
		},
		removeItem(key) {
			removedKey = key;
		}
	};

	const result = safeSetLocalStorageJson("history", ["only"], {
		storage,
		trim: trimPersistedChatHistory,
		onError: () => {}
	});

	assert.equal(result, false);
	assert.equal(removedKey, "history");
});
