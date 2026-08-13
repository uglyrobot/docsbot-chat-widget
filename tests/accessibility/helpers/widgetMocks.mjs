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

  if (normalizedQuestion.includes("linked image")) {
    const answer = [
      "Here is a linked image from the answer.",
      "",
      "[![DocsBot linked image](https://example.com/docsbot-answer-demo.svg)](http://127.0.0.1:4173/linked-image-target)",
    ].join("\n");

    return `event: stream
data: ${answer.replaceAll("\n", "\nevent: stream\ndata: ")}

event: done
data: ${JSON.stringify({
  answer,
  history: [
    { role: "user", message: question },
    { role: "assistant", message: answer },
  ],
  id: "answer-linked-image",
})}

`;
  }

  if (normalizedQuestion.includes("image")) {
    const answer = [
      "Here is the image from the answer.",
      "",
      "![DocsBot answer image](https://example.com/docsbot-answer-demo.svg)",
      "",
      "The conversation stays here after you close the enlarged view.",
    ].join("\n");

    return `event: stream
data: ${answer.replaceAll("\n", "\nevent: stream\ndata: ")}

event: done
data: ${JSON.stringify({
  answer,
  history: [
    { role: "user", message: question },
    { role: "assistant", message: answer },
  ],
  id: "answer-image",
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

export async function installWidgetMocks(page, widgetConfig = mockWidgetConfig) {
  await page.route(/(?:docsbot\.ai\/api|localhost:3000\/api)\/widget\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(widgetConfig),
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

  await page.route("http://127.0.0.1:9000/teams/**/chat-agent", async (route) => {
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

  await page.route("https://example.com/docsbot-answer-demo.svg", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="background" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#17324d" />
      <stop offset="1" stop-color="#0e7490" />
    </linearGradient>
  </defs>
  <rect width="960" height="540" rx="28" fill="url(#background)" />
  <circle cx="790" cy="110" r="120" fill="#67e8f9" opacity=".24" />
  <circle cx="180" cy="460" r="190" fill="#a7f3d0" opacity=".16" />
  <rect x="96" y="96" width="768" height="348" rx="22" fill="#f8fafc" opacity=".96" />
  <rect x="142" y="145" width="300" height="24" rx="12" fill="#0e7490" />
  <rect x="142" y="202" width="610" height="14" rx="7" fill="#cbd5e1" />
  <rect x="142" y="232" width="530" height="14" rx="7" fill="#cbd5e1" />
  <rect x="142" y="290" width="190" height="88" rx="14" fill="#67e8f9" opacity=".75" />
  <rect x="354" y="290" width="190" height="88" rx="14" fill="#a7f3d0" opacity=".8" />
  <rect x="566" y="290" width="190" height="88" rx="14" fill="#fde68a" opacity=".8" />
  <text x="142" y="416" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#17324d">DocsBot answer image</text>
</svg>`,
    });
  });
}
