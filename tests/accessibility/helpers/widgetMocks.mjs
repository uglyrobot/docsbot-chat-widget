export const mockWidgetConfig = {
  name: "DocsBot Accessibility Demo",
  botName: "DocsBot Accessibility Demo",
  botIcon: "",
  description: "Accessibility test harness for the DocsBot widget.",
  questions: [
    {
      label: "What can you do?",
      question: "What can you do?",
    },
  ],
  labels: {
    firstMessage: "Welcome to the accessibility demo.",
  },
  language: "en",
  allowedDomains: [],
};

function buildAgentSse({ question }) {
  const normalizedQuestion = String(question || "").trim().toLowerCase();

  if (normalizedQuestion.includes("support")) {
    return `event: stream
data: I can connect you with support.

event: support_escalation
data: ${JSON.stringify({
  answer: "I can connect you with support.",
  options: {
    yes: "Contact support",
    no: "No",
  },
  history: [
    { role: "user", message: question },
    { role: "assistant", message: "I can connect you with support." },
  ],
  id: "answer-support",
})}

`;
  }

  return `event: stream
data: Here is a mocked answer with a source.

event: done
data: ${JSON.stringify({
  answer: "Here is a mocked answer with a source.",
  sources: [
    {
      title: "Example source",
      url: "https://example.com/docs/widget-accessibility",
      type: "url",
    },
  ],
  history: [
    { role: "user", message: question },
    {
      role: "assistant",
      message: "Here is a mocked answer with a source.",
    },
  ],
  id: "answer-default",
})}

`;
}

export async function installWidgetMocks(page) {
  await page.route("https://docsbot.ai/api/widget/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWidgetConfig),
    });
  });

  await page.route("https://api.docsbot.ai/teams/**/chat-agent", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      body: buildAgentSse(body),
    });
  });
}
