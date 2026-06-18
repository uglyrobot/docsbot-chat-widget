import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisibleMessageKeys,
  sanitizeRestoredConversation,
  shouldShowErrorSupportButton,
} from "./chatbotMessageState.mjs";

test("sanitizeRestoredConversation preserves entry tuples and removes stale lead collection", () => {
  const savedConversation = {
    greeting: {
      id: "greeting",
      variant: "chatbot",
      message: "What can I help you with?",
    },
    lead: {
      id: "lead",
      variant: "chatbot",
      type: "lead_collect",
      message: "Before we continue...",
    },
    answer: {
      id: "answer",
      variant: "chatbot",
      message: "Answer",
      schedulerEmbedCompleted: true,
      schedulerEmbed: { provider: "calendly", path: "demo" },
    },
  };

  assert.doesNotThrow(() => {
    sanitizeRestoredConversation(savedConversation, { allowLeadCollect: false });
  });

  assert.deepEqual(
    sanitizeRestoredConversation(savedConversation, { allowLeadCollect: false }),
    {
      greeting: savedConversation.greeting,
      answer: {
        ...savedConversation.answer,
        schedulerEmbed: null,
      },
    }
  );
});

test("sanitizeRestoredConversation keeps lead collection when enabled", () => {
  const savedConversation = {
    lead: {
      id: "lead",
      variant: "chatbot",
      type: "lead_collect",
      message: "Before we continue...",
    },
  };

  assert.deepEqual(
    sanitizeRestoredConversation(savedConversation, { allowLeadCollect: true }),
    savedConversation
  );
});

test("getVisibleMessageKeys keeps the initial greeting after conversation starts", () => {
  const messages = {
    greeting: {
      id: "greeting",
      variant: "chatbot",
      message: "What can I help you with?",
    },
    user: {
      id: "user",
      variant: "user",
      message: "Hello",
    },
    answer: {
      id: "answer",
      variant: "chatbot",
      message: "Hi",
    },
  };

  assert.deepEqual(getVisibleMessageKeys(messages), [
    "greeting",
    "user",
    "answer",
  ]);
});

test("shouldShowErrorSupportButton suppresses browser microphone errors only when flagged", () => {
  assert.equal(
    shouldShowErrorSupportButton({
      isLast: true,
      error: true,
      suppressSupportButton: true,
    }),
    false
  );
  assert.equal(
    shouldShowErrorSupportButton({
      isLast: true,
      error: true,
    }),
    true
  );
  assert.equal(
    shouldShowErrorSupportButton({
      isLast: true,
      error: true,
      isRateLimitError: true,
    }),
    false
  );
});
