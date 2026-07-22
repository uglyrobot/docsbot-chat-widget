const DEFAULT_DOCSBOT_API_BASE = "https://api.docsbot.ai";

export function resolveLiveVoiceEnabled({ voiceAgent, useVoiceAgent } = {}) {
  if (typeof useVoiceAgent === "boolean") return useVoiceAgent;
  if (!voiceAgent || typeof voiceAgent !== "object") return false;

  if (voiceAgent.widgetEnabled === false || voiceAgent.webrtcEnabled === false) {
    return false;
  }

  return voiceAgent.enabled === true;
}

export function resolveVoiceApiBase({ localDev, voiceApiBaseUrl } = {}) {
  if (typeof voiceApiBaseUrl === "string" && voiceApiBaseUrl.trim()) {
    return voiceApiBaseUrl.trim().replace(/\/$/, "");
  }
  return localDev ? "http://127.0.0.1:9000" : DEFAULT_DOCSBOT_API_BASE;
}

export function waitForIceGatheringComplete(peerConnection, timeoutMs = 5000) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timeoutId;
    const finish = () => {
      peerConnection.removeEventListener?.("icegatheringstatechange", onChange);
      if (timeoutId) clearTimeout(timeoutId);
      resolve();
    };
    const onChange = () => {
      if (peerConnection.iceGatheringState === "complete") finish();
    };

    peerConnection.addEventListener?.("icegatheringstatechange", onChange);
    timeoutId = setTimeout(finish, timeoutMs);
  });
}

async function responseError(response) {
  const fallback = `Voice call could not start (HTTP ${response.status})`;
  try {
    const body = await response.clone().json();
    return body?.error || body?.detail || body?.message || fallback;
  } catch {
    try {
      const body = (await response.text()).trim();
      return body || fallback;
    } catch {
      return fallback;
    }
  }
}

export async function createDocsBotVoiceSession({
  teamId,
  botId,
  signature,
  localDev = false,
  voiceApiBaseUrl,
  audioElement,
  signal,
  onStateChange = () => {},
  fetchImpl = globalThis.fetch,
  mediaDevices = globalThis.navigator?.mediaDevices,
  RTCPeerConnectionCtor = globalThis.RTCPeerConnection,
}) {
  if (!teamId || !botId) throw new Error("DocsBot team and bot IDs are required");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  if (!mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable");
  if (typeof RTCPeerConnectionCtor !== "function") {
    throw new Error("Live voice calls are not supported by this browser");
  }

  onStateChange("connecting");
  let stream;
  let peerConnection;
  let eventsDataChannel;
  let ended = false;
  let muted = false;

  const cleanup = (notify = true) => {
    if (ended) return;
    ended = true;
    signal?.removeEventListener?.("abort", handleAbort);
    stream?.getTracks?.().forEach((track) => track.stop());
    eventsDataChannel?.close?.();
    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }
    if (audioElement) {
      audioElement.pause?.();
      audioElement.srcObject = null;
    }
    if (notify) onStateChange("ended");
  };
  const end = () => cleanup(true);
  const handleAbort = () => cleanup(true);

  try {
    if (signal?.aborted) throw new DOMException("Voice call cancelled", "AbortError");
    signal?.addEventListener?.("abort", handleAbort, { once: true });
    stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    peerConnection = new RTCPeerConnectionCtor();
    eventsDataChannel = peerConnection.createDataChannel("oai-events");

    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.ontrack = (event) => {
      if (!audioElement) return;
      audioElement.srcObject = event.streams?.[0] || new MediaStream([event.track]);
      void audioElement.play?.().catch(() => {});
    };
    peerConnection.onconnectionstatechange = () => {
      if (ended) return;
      const state = peerConnection.connectionState;
      if (state === "connected") onStateChange("connected");
      if (state === "failed") onStateChange("error");
      if (state === "closed") onStateChange("ended");
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);

    const apiBase = resolveVoiceApiBase({ localDev, voiceApiBaseUrl });
    const response = await fetchImpl(
      `${apiBase}/teams/${encodeURIComponent(teamId)}/bots/${encodeURIComponent(botId)}/voice/webrtc`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Accept: "application/sdp",
          ...(signature ? { Authorization: `Bearer ${signature}` } : {}),
        },
        body: peerConnection.localDescription?.sdp || offer.sdp,
        signal,
      },
    );

    if (!response.ok) throw new Error(await responseError(response));
    const answerSdp = await response.text();
    if (!answerSdp.trim()) throw new Error("DocsBot returned an empty voice answer");
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

    return {
      end,
      setMuted(nextMuted) {
        muted = Boolean(nextMuted);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
        });
        return muted;
      },
      isMuted() {
        return muted;
      },
      peerConnection,
      eventsDataChannel,
      stream,
    };
  } catch (error) {
    cleanup(false);
    if (error?.name !== "AbortError") onStateChange("error");
    throw error;
  }
}
