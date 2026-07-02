import assert from "node:assert/strict";
import test from "node:test";
import {
	mapChatHistoryStrings,
	mapChatHistoryStringsSync
} from "./chatHistoryTransforms.mjs";

test("mapChatHistoryStrings preserves non-agent tuple history entries", async () => {
	const history = [
		[
			"How do I activate Dr.Sum products?",
			"Open the License Manager and enter your activation key."
		]
	];

	const mapped = await mapChatHistoryStrings(
		history,
		async (text) => `[safe] ${text}`
	);

	assert.deepEqual(mapped, [
		[
			"[safe] How do I activate Dr.Sum products?",
			"[safe] Open the License Manager and enter your activation key."
		]
	]);
	assert.equal(Array.isArray(mapped[0]), true);
	assert.equal(Object.hasOwn(mapped[0], "0"), true);
	assert.equal(Object.getPrototypeOf(mapped[0]), Array.prototype);
});

test("mapChatHistoryStrings maps object history text fields only", async () => {
	const history = [
		{
			role: "user",
			message: "hello",
			metadata: { untouched: "hello" }
		}
	];

	const mapped = await mapChatHistoryStrings(
		history,
		async (text) => text.toUpperCase()
	);

	assert.deepEqual(mapped, [
		{
			role: "user",
			message: "HELLO",
			metadata: { untouched: "hello" }
		}
	]);
});

test("mapChatHistoryStringsSync preserves tuple history entries", () => {
	const mapped = mapChatHistoryStringsSync([["[pii-1]", "answer"]], (text) =>
		text.replace("[pii-1]", "email@example.com")
	);

	assert.deepEqual(mapped, [["email@example.com", "answer"]]);
	assert.equal(Array.isArray(mapped[0]), true);
});
