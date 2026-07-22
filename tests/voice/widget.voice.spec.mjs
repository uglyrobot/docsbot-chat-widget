import { expect, test } from "@playwright/test";

const MOCK_CONFIG = {
  name: "DocsBot Voice Test",
  botName: "DocsBot Voice Test",
  botIcon: "",
  description: "Browser WebRTC test harness.",
  questions: [],
  labels: { firstMessage: "How can I help?" },
  language: "en",
  allowedDomains: [],
  isAgent: true,
  useAudioUpload: true,
  voiceAgent: { enabled: true, widgetEnabled: true },
};

async function installVoiceMocks(page) {
  // Build the mock answer in a second real browser page so the caller page can
  // remain blocked on fetch while Playwright fulfills the DocsBot route.
  const peerPage = await page.context().newPage();
  await peerPage.goto("about:blank");
  const widgetConfigPatterns = [
    "https://docsbot.ai/api/widget/**",
    "http://localhost:3000/api/widget/**",
  ];
  for (const pattern of widgetConfigPatterns) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CONFIG),
      }),
    );
  }

  const voiceEndpointPatterns = [
    "https://api.docsbot.ai/teams/**/voice/webrtc",
    "http://127.0.0.1:9000/teams/**/voice/webrtc",
  ];
  for (const pattern of voiceEndpointPatterns) {
    await page.route(pattern, async (route) => {
      const request = route.request();
      expect(await request.headerValue("content-type")).toContain("application/sdp");
      const offerSdp = request.postData();
      expect(offerSdp).toContain("v=0");
      expect(offerSdp).toContain("m=application");
      expect(offerSdp).toMatch(/a=sctp-port:|a=sctpmap:/);

      const answerSdp = await peerPage.evaluate(async (offer) => {
        window.__docsbotVoiceTestPeer?.close();
        const peer = new RTCPeerConnection();
        window.__docsbotVoiceTestPeer = peer;
        window.__docsbotVoiceTestStream = new MediaStream();
        peer.ondatachannel = (event) => {
          window.__docsbotVoiceTestDataChannel = event.channel;
        };
        peer.ontrack = (event) => {
          window.__docsbotVoiceTestStream.addTrack(event.track);
        };
        await peer.setRemoteDescription({ type: "offer", sdp: offer });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (peer.iceGatheringState !== "complete") {
          await new Promise((resolve) => {
            const onChange = () => {
              if (peer.iceGatheringState !== "complete") return;
              peer.removeEventListener("icegatheringstatechange", onChange);
              resolve();
            };
            peer.addEventListener("icegatheringstatechange", onChange);
          });
        }
        return peer.localDescription.sdp;
      }, offerSdp);

      await route.fulfill({
        status: 200,
        contentType: "application/sdp",
        body: answerSdp,
      });
    });
  }

  return peerPage;
}

async function openVoiceTestWidget(page) {
  await page.route("**/voice-test-harness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html><body>
          <div id="docsbot-widget-embed"></div>
          <script src="/chat.js"></script>
          <script>
            addEventListener('load', () => DocsBotAI.mount({
              id: 'test-team/test-bot',
              options: {
                useVoiceAgent: true,
                useAudioUpload: true,
                voiceApiBaseUrl: 'http://127.0.0.1:9000'
              }
            }));
          </script>
        </body></html>`,
    });
  });
  await page.goto("/voice-test-harness");
  const root = page.locator("#docsbot-widget-embed");
  await expect(root.locator("textarea")).toBeVisible();
  return root;
}

test("starts, mutes, and ends a real browser WebRTC call through DocsBot SDP", async ({
  page,
}) => {
  const peerPage = await installVoiceMocks(page);
  const root = await openVoiceTestWidget(page);

  await expect(
    root.getByRole("button", { name: "Record voice message" }),
  ).toBeVisible();

  await root.getByRole("button", { name: "Start voice call" }).click();
  await expect(root.getByText("Voice call active")).toBeVisible();

  const muteButton = root.getByRole("button", { name: "Mute microphone" });
  await muteButton.click();
  await expect(
    root.getByRole("button", { name: "Unmute microphone" }),
  ).toHaveAttribute("aria-pressed", "true");

  await root.getByRole("button", { name: "End voice call" }).click();
  await expect(root.getByText("Voice call ended")).toBeVisible();
  await expect(
    root.getByRole("button", { name: "Start voice call" }),
  ).toBeVisible();
  await peerPage.close();
});

const liveId = process.env.DOCSBOT_VOICE_LIVE_ID;
const liveSignature = process.env.DOCSBOT_VOICE_LIVE_SIGNATURE || "";

test("opt-in live DocsBot voice target connects", async ({ page }) => {
  test.skip(
    !liveId,
    "Set DOCSBOT_VOICE_LIVE_ID=team_id/bot_id to run the live DocsBot WebRTC check",
  );

  const [teamId, botId] = liveId.split("/");
  test.skip(!teamId || !botId, "DOCSBOT_VOICE_LIVE_ID must be team_id/bot_id");

  await page.route("**/voice-live-harness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html><body>
          <div id="docsbot-widget-embed"></div>
          <script src="/chat.js"></script>
          <script>
            addEventListener('load', () => DocsBotAI.mount({
              id: ${JSON.stringify(liveId)},
              signature: ${JSON.stringify(liveSignature)},
              options: { useVoiceAgent: true }
            }));
          </script>
        </body></html>`,
    });
  });

  await page.goto("/voice-live-harness");
  const root = page.locator("#docsbot-widget-embed");
  const start = root.getByRole("button", { name: "Start voice call" });
  await expect(start).toBeVisible();
  await start.click();
  await expect(root.getByText("Voice call active")).toBeVisible({
    timeout: 30_000,
  });
  await root.getByRole("button", { name: "End voice call" }).click();
  await expect(root.getByText("Voice call ended")).toBeVisible();
});
