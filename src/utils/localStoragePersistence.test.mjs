import assert from "node:assert/strict";
import test from "node:test";
import {
	cleanupExpiredDocsBotLocalStorage,
	safeSetLocalStorageJson,
	trimPersistedChatHistory,
	trimPersistedConversationMessages
} from "./localStoragePersistence.mjs";

function createMemoryStorage(initial = {}) {
	const data = new Map(Object.entries(initial));
	return {
		get length() {
			return data.size;
		},
		key(index) {
			return Array.from(data.keys())[index] ?? null;
		},
		getItem(key) {
			return data.has(key) ? data.get(key) : null;
		},
		setItem(key, value) {
			data.set(key, String(value));
		},
		removeItem(key) {
			data.delete(key);
		},
		has(key) {
			return data.has(key);
		}
	};
}

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

test("cleanupExpiredDocsBotLocalStorage removes expired data for other bots", () => {
	const now = Date.UTC(2026, 6, 1);
	const oldTimestamp = now - 13 * 60 * 60 * 1000;
	const freshTimestamp = now - 60 * 1000;
	const storage = createMemoryStorage({
		DocsBot_oldBot_chatHistory: JSON.stringify({
			a: { timestamp: oldTimestamp, message: "old" }
		}),
		DocsBot_oldBot_localChatHistory: JSON.stringify([
			{ role: "user", message: "old" }
		]),
		DocsBot_oldBot_conversationId: "old-conversation",
		DocsBot_oldBot_piiRedactionSession_old: JSON.stringify({
			updatedAt: oldTimestamp,
			session: { entries: [["EMAIL", "[EMAIL_1]", "old@example.com"]] }
		}),
		DocsBot_freshBot_chatHistory: JSON.stringify({
			a: { timestamp: freshTimestamp, message: "fresh" }
		}),
		DocsBot_currentBot_chatHistory: JSON.stringify({
			a: { timestamp: oldTimestamp, message: "current" }
		})
	});

	const removed = cleanupExpiredDocsBotLocalStorage({
		storage,
		now,
		currentBotId: "currentBot"
	});

	assert.deepEqual(removed.sort(), [
		"DocsBot_oldBot_chatHistory",
		"DocsBot_oldBot_conversationId",
		"DocsBot_oldBot_localChatHistory",
		"DocsBot_oldBot_piiRedactionSession_old"
	]);
	assert.equal(storage.has("DocsBot_oldBot_chatHistory"), false);
	assert.equal(storage.has("DocsBot_freshBot_chatHistory"), true);
	assert.equal(storage.has("DocsBot_currentBot_chatHistory"), true);
});

test("cleanupExpiredDocsBotLocalStorage removes stale orphan pii sessions", () => {
	const now = Date.UTC(2026, 6, 1);
	const oldTimestamp = now - 13 * 60 * 60 * 1000;
	const freshTimestamp = now - 60 * 1000;
	const storage = createMemoryStorage({
		DocsBot_orphanBot_piiRedactionSession_old: JSON.stringify({
			updatedAt: oldTimestamp,
			session: { entries: [["EMAIL", "[EMAIL_1]", "old@example.com"]] }
		}),
		DocsBot_orphanBot_piiRedactionSession_fresh: JSON.stringify({
			updatedAt: freshTimestamp,
			session: { entries: [["EMAIL", "[EMAIL_1]", "fresh@example.com"]] }
		})
	});

	const removed = cleanupExpiredDocsBotLocalStorage({ storage, now });

	assert.deepEqual(removed, ["DocsBot_orphanBot_piiRedactionSession_old"]);
	assert.equal(
		storage.has("DocsBot_orphanBot_piiRedactionSession_fresh"),
		true
	);
});
