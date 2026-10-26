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

test("mixed answer history PII transforms include Markdown and UI in the existing AI field", async () => {
 const history=[{Human:"Hi",AI:'Text [pii-1]\n```openui-lang\nroot = Stack([TextContent("[pii-1]")])\n```'}];
 const mapped=await mapChatHistoryStrings(history,async text=>text.replaceAll("[pii-1]","[safe]"));
 assert.equal(mapped[0].AI.includes("[pii-1]"),false);assert.ok(mapped[0].AI.includes('TextContent("[safe]")'));
 const restored=mapChatHistoryStringsSync(mapped,text=>text.replaceAll("[safe]","person@example.com"));
 assert.ok(restored[0].AI.includes('TextContent("person@example.com")'));assert.equal(restored[0].Human,'Hi');
});
