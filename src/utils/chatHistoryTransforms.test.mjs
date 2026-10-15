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

test("chat history PII transforms include the generated UI payload", async () => {
	const history = [{ AI: "A readable reply", generativeUI: { response: 'root = Stack([card])\ncard = TextBlock("[pii-1]")', libraryVersion: "1.0.0" } }];
	const mapped = await mapChatHistoryStrings(history, async (text) => text.replace("[pii-1]", "[safe]"));
	assert.equal(mapped[0].AI, "A readable reply");
	assert.equal(mapped[0].generativeUI.response.includes("[safe]"), true);
	assert.equal(mapped[0].generativeUI.libraryVersion, "1.0.0");
});

test("chat history PII restoration includes the generated UI payload", () => {
	const history = [{ AI: "A readable reply", generativeUI: { response: 'root = Stack([card])\ncard = TextBlock("[pii-1]")', libraryVersion: "1.0.0" } }];
	const mapped = mapChatHistoryStringsSync(history, (text) => text.replace("[pii-1]", "person@example.com"));
	assert.equal(mapped[0].generativeUI.response.includes("person@example.com"), true);
	assert.equal(mapped[0].generativeUI.libraryVersion, "1.0.0");
});
