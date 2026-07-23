import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocsBotVoiceSession,
  resolveLiveVoiceEnabled,
  resolveVoiceApiBase,
  serializeVoiceMetadata,
  waitForIceGatheringComplete,
} from "./voiceWebRtc.mjs";

test("enables live voice from saved bot config while allowing an embed override", () => {
  assert.equal(resolveLiveVoiceEnabled({ voiceAgent: { enabled: true } }), true);
  assert.equal(
    resolveLiveVoiceEnabled({ voiceAgent: { enabled: true, widgetEnabled: false } }),
    false,
  );
  assert.equal(
    resolveLiveVoiceEnabled({ voiceAgent: { enabled: false }, useVoiceAgent: true }),
    true,
  );
});

test("resolves production, local, and explicit DocsBot API bases", () => {
  assert.equal(resolveVoiceApiBase(), "https://api.docsbot.ai");
  assert.equal(resolveVoiceApiBase({ localDev: true }), "http://127.0.0.1:9000");
  assert.equal(
    resolveVoiceApiBase({ voiceApiBaseUrl: "http://127.0.0.1:4567/" }),
    "http://127.0.0.1:4567",
  );
});

test("serializes only public widget metadata for the voice request", () => {
  assert.equal(
    serializeVoiceMetadata({
      account_name: "Acme",
      plan: "pro",
      priv_stripe_customer_id: "cus_secret",
    }),
    JSON.stringify({ account_name: "Acme", plan: "pro" }),
  );
});

test("waits for ICE gathering and removes its listener", async () => {
  let listener;
  const peerConnection = {
    iceGatheringState: "gathering",
    addEventListener(_name, callback) {
      listener = callback;
    },
    removeEventListener(_name, callback) {
      assert.equal(callback, listener);
      listener = null;
    },
  };

  const pending = waitForIceGatheringComplete(peerConnection, 100);
  peerConnection.iceGatheringState = "complete";
  listener();
  await pending;
  assert.equal(listener, null);
});

test("posts SDP to DocsBot with widget auth, supports mute, and cleans up", async () => {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  const states = [];
  const clientActions = [];
  const sessions = [];
  let request;

  class MockPeerConnection {
    constructor() {
      this.iceGatheringState = "complete";
      this.connectionState = "new";
    }
    addTrack(addedTrack, addedStream) {
      assert.equal(addedTrack, track);
      assert.equal(addedStream, stream);
    }
    createDataChannel(label) {
      this.dataChannel = {
        label,
        closed: false,
        sent: [],
        readyState: "open",
        addEventListener(name, callback) {
          if (name === "message") this.onMessage = callback;
        },
        send(message) { this.sent.push(JSON.parse(message)); },
        close() { this.closed = true; },
      };
      return this.dataChannel;
    }
    async createOffer() { return { type: "offer", sdp: "test-offer" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) { this.remoteDescription = answer; }
    close() { this.connectionState = "closed"; }
  }

  const session = await createDocsBotVoiceSession({
    teamId: "team 1",
    botId: "bot/1",
    signature: "signed-widget-token",
    conversationId: "conversation-1",
    metadata: {
      account_name: "Acme",
      priv_stripe_customer_id: "cus_never_send",
    },
    mediaDevices: { getUserMedia: async () => stream },
    RTCPeerConnectionCtor: MockPeerConnection,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response("test-answer", {
        status: 200,
        headers: {
          "X-DocsBot-Voice-Call-Id": "call-1",
          "X-DocsBot-Conversation-Id": "conversation-1",
        },
      });
    },
    onStateChange: (state) => states.push(state),
    onClientAction: (action) => clientActions.push(action),
    onSession: (sessionInfo) => sessions.push(sessionInfo),
  });

  assert.equal(
    request.url,
    "https://api.docsbot.ai/teams/team%201/bots/bot%2F1/voice/webrtc",
  );
  assert.equal(request.options.headers.Authorization, "Bearer signed-widget-token");
  assert.equal(
    request.options.headers["X-DocsBot-Conversation-Id"],
    "conversation-1",
  );
  assert.equal(
    request.options.headers["X-DocsBot-Metadata"],
    JSON.stringify({ account_name: "Acme" }),
  );
  assert.equal(request.options.headers["Content-Type"], "application/sdp");
  assert.equal(request.options.body, "test-offer");
  assert.equal(session.eventsDataChannel.label, "oai-events");
  assert.deepEqual(session.peerConnection.remoteDescription, {
    type: "answer",
    sdp: "test-answer",
  });
  assert.deepEqual(sessions, [
    { callId: "call-1", conversationId: "conversation-1" },
  ]);
  session.eventsDataChannel.onMessage({
    data: JSON.stringify({
      item: {
        type: "function_call_output",
        output: JSON.stringify({
          client_action: {
            type: "custom_button",
            buttonText: "Open account",
          },
        }),
      },
    }),
  });
  assert.deepEqual(clientActions, [
    { type: "custom_button", buttonText: "Open account" },
  ]);

  assert.equal(session.sendText("No, thanks"), true);
  assert.deepEqual(session.eventsDataChannel.sent, [
    {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "No, thanks" }],
      },
    },
    { type: "response.create" },
  ]);

  assert.equal(session.setMuted(true), true);
  assert.equal(track.enabled, false);
  session.end();
  assert.equal(track.stopped, true);
  assert.equal(session.eventsDataChannel.closed, true);
  assert.deepEqual(states, ["connecting", "ended"]);
});

test("reports output level from the remote model audio stream", async () => {
  const micTrack = { stop() {} };
  const micStream = {
    getTracks: () => [micTrack],
    getAudioTracks: () => [micTrack],
  };
  const remoteStream = { id: "model-audio" };
  const levels = [];
  let animationFrame;
  let analyserDisconnected = false;
  let sourceDisconnected = false;
  let contextClosed = false;

  class MockAudioContext {
    createMediaStreamSource(stream) {
      assert.equal(stream, remoteStream);
      return {
        connect() {},
        disconnect() { sourceDisconnected = true; },
      };
    }
    createAnalyser() {
      return {
        fftSize: 0,
        smoothingTimeConstant: 0,
        getByteTimeDomainData(samples) { samples.fill(160); },
        disconnect() { analyserDisconnected = true; },
      };
    }
    resume() {}
    close() { contextClosed = true; }
  }

  class MockPeerConnection {
    constructor() { this.iceGatheringState = "complete"; }
    addTrack() {}
    createDataChannel() { return { addEventListener() {}, close() {} }; }
    async createOffer() { return { type: "offer", sdp: "offer" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription() {}
    close() {}
  }

  const session = await createDocsBotVoiceSession({
    teamId: "team",
    botId: "bot",
    mediaDevices: { getUserMedia: async () => micStream },
    RTCPeerConnectionCtor: MockPeerConnection,
    AudioContextCtor: MockAudioContext,
    requestAnimationFrameImpl(callback) {
      animationFrame = callback;
      return 1;
    },
    cancelAnimationFrameImpl() {},
    fetchImpl: async () => new Response("answer", { status: 200 }),
    onOutputLevel: (level) => levels.push(level),
  });

  session.peerConnection.ontrack({ streams: [remoteStream] });
  animationFrame();
  assert.ok(levels.at(-1) > 0);

  session.end();
  assert.equal(levels.at(-1), 0);
  assert.equal(sourceDisconnected, true);
  assert.equal(analyserDisconnected, true);
  assert.equal(contextClosed, true);
});

test("cleans up the microphone when DocsBot rejects the call", async () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };

  class MockPeerConnection {
    constructor() { this.iceGatheringState = "complete"; }
    addTrack() {}
    createDataChannel() { return { close() {} }; }
    async createOffer() { return { type: "offer", sdp: "offer" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    close() {}
  }

  await assert.rejects(
    createDocsBotVoiceSession({
      teamId: "team",
      botId: "bot",
      mediaDevices: { getUserMedia: async () => stream },
      RTCPeerConnectionCtor: MockPeerConnection,
      fetchImpl: async () =>
        new Response(JSON.stringify({ detail: "Voice agent is disabled" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
    }),
    /Voice agent is disabled/,
  );
  assert.equal(track.stopped, true);
});

test("surfaces the FastAPI voice error payload", async () => {
  const track = { stop() {} };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };

  class MockPeerConnection {
    constructor() { this.iceGatheringState = "complete"; }
    addTrack() {}
    createDataChannel() { return { close() {} }; }
    async createOffer() { return { type: "offer", sdp: "offer" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    close() {}
  }

  await assert.rejects(
    createDocsBotVoiceSession({
      teamId: "team",
      botId: "bot",
      mediaDevices: { getUserMedia: async () => stream },
      RTCPeerConnectionCtor: MockPeerConnection,
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "Daily voice limit reached" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
    }),
    /Daily voice limit reached/,
  );
});
