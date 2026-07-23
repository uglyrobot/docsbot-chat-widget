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

export function isVoiceOutputActive(level, callState) {
  return callState === "connected" && Number(level) >= 0.04;
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

export function serializeVoiceMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const publicMetadata = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => typeof key === "string" && !key.startsWith("priv_"),
    ),
  );
  try {
    const serialized = JSON.stringify(publicMetadata);
    return serialized.length <= 16_384 ? serialized : "";
  } catch {
    return "";
  }
}

export async function createDocsBotVoiceSession({
  teamId,
  botId,
  signature,
  localDev = false,
  voiceApiBaseUrl,
  audioElement,
  conversationId,
  metadata,
  onClientAction = () => {},
  onOutputLevel = () => {},
  onSession = () => {},
  signal,
  onStateChange = () => {},
  fetchImpl = globalThis.fetch,
  mediaDevices = globalThis.navigator?.mediaDevices,
  RTCPeerConnectionCtor = globalThis.RTCPeerConnection,
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  requestAnimationFrameImpl = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelAnimationFrameImpl = globalThis.cancelAnimationFrame?.bind(globalThis),
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
  let outputAudioContext;
  let outputSource;
  let outputAnalyser;
  let outputAnimationFrame;

  const stopOutputAnalysis = () => {
    if (outputAnimationFrame != null) {
      cancelAnimationFrameImpl?.(outputAnimationFrame);
      outputAnimationFrame = null;
    }
    outputSource?.disconnect?.();
    outputAnalyser?.disconnect?.();
    outputSource = null;
    outputAnalyser = null;
    void outputAudioContext?.close?.();
    outputAudioContext = null;
    onOutputLevel(0);
  };

  const startOutputAnalysis = (remoteStream) => {
    stopOutputAnalysis();
    if (
      !remoteStream ||
      typeof AudioContextCtor !== "function" ||
      typeof requestAnimationFrameImpl !== "function"
    ) return;
    try {
      outputAudioContext = new AudioContextCtor();
      outputSource = outputAudioContext.createMediaStreamSource(remoteStream);
      outputAnalyser = outputAudioContext.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyser.smoothingTimeConstant = 0.72;
      outputSource.connect(outputAnalyser);
      void outputAudioContext.resume?.();
      const samples = new Uint8Array(outputAnalyser.fftSize);
      let smoothedLevel = 0;
      const updateLevel = () => {
        if (ended || !outputAnalyser) return;
        outputAnalyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        const target = Math.min(1, rms * 4.5);
        smoothedLevel = smoothedLevel * 0.68 + target * 0.32;
        onOutputLevel(smoothedLevel);
        outputAnimationFrame = requestAnimationFrameImpl(updateLevel);
      };
      outputAnimationFrame = requestAnimationFrameImpl(updateLevel);
    } catch {
      stopOutputAnalysis();
    }
  };

  const cleanup = (notify = true) => {
    if (ended) return;
    ended = true;
    signal?.removeEventListener?.("abort", handleAbort);
    stream?.getTracks?.().forEach((track) => track.stop());
    stopOutputAnalysis();
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
    eventsDataChannel.addEventListener?.("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const item = payload?.item;
        if (item?.type !== "function_call_output" || !item.output) return;
        const output = JSON.parse(item.output);
        if (output?.client_action) onClientAction(output.client_action);
      } catch {
        // Other Realtime events are not widget actions.
      }
    });

    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      startOutputAnalysis(remoteStream);
      if (audioElement) {
        audioElement.srcObject = remoteStream;
        void audioElement.play?.().catch(() => {});
      }
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
    const serializedMetadata = serializeVoiceMetadata(metadata);
    const response = await fetchImpl(
      `${apiBase}/teams/${encodeURIComponent(teamId)}/bots/${encodeURIComponent(botId)}/voice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Accept: "application/sdp",
          ...(signature ? { Authorization: `Bearer ${signature}` } : {}),
          ...(conversationId
            ? { "X-DocsBot-Conversation-Id": conversationId }
            : {}),
          ...(serializedMetadata
            ? { "X-DocsBot-Metadata": serializedMetadata }
            : {}),
        },
        body: peerConnection.localDescription?.sdp || offer.sdp,
        signal,
      },
    );

    if (!response.ok) throw new Error(await responseError(response));
    const answerSdp = await response.text();
    if (!answerSdp.trim()) throw new Error("DocsBot returned an empty voice answer");
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    onSession({
      callId: response.headers?.get?.("X-DocsBot-Voice-Call-Id") || null,
      conversationId:
        response.headers?.get?.("X-DocsBot-Conversation-Id") || null,
    });

    return {
      end,
      sendText(text) {
        const value = String(text || "").trim();
        if (
          !value ||
          typeof eventsDataChannel?.send !== "function" ||
          (eventsDataChannel.readyState && eventsDataChannel.readyState !== "open")
        ) return false;
        eventsDataChannel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: value }],
            },
          }),
        );
        eventsDataChannel.send(JSON.stringify({ type: "response.create" }));
        return true;
      },
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
