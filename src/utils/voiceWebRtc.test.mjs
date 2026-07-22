import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocsBotVoiceSession,
  resolveLiveVoiceEnabled,
  resolveVoiceApiBase,
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
      this.dataChannel = { label, closed: false, close() { this.closed = true; } };
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
    mediaDevices: { getUserMedia: async () => stream },
    RTCPeerConnectionCtor: MockPeerConnection,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response("test-answer", { status: 200 });
    },
    onStateChange: (state) => states.push(state),
  });

  assert.equal(
    request.url,
    "https://api.docsbot.ai/teams/team%201/bots/bot%2F1/voice/webrtc",
  );
  assert.equal(request.options.headers.Authorization, "Bearer signed-widget-token");
  assert.equal(request.options.headers["Content-Type"], "application/sdp");
  assert.equal(request.options.body, "test-offer");
  assert.equal(session.eventsDataChannel.label, "oai-events");
  assert.deepEqual(session.peerConnection.remoteDescription, {
    type: "answer",
    sdp: "test-answer",
  });

  assert.equal(session.setMuted(true), true);
  assert.equal(track.enabled, false);
  session.end();
  assert.equal(track.stopped, true);
  assert.equal(session.eventsDataChannel.closed, true);
  assert.deepEqual(states, ["connecting", "ended"]);
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
