// HTTP snapshots are authoritative. Socket frames are only invalidations.
export function startHelpdeskRealtime({ getGrant, refresh, onError = () => {}, isCurrent = () => true, socketFactory = (url, protocols) => new WebSocket(url, protocols), documentRef = document, now = Date.now, random = Math.random, timers = globalThis, retryBaseMs = 1000, retryMaxMs = 60000, fallbackBaseMs = 5000, fallbackMaxMs = 30000, disabledRetryMs = 300000, connectTimeoutMs = 10000, heartbeatIntervalMs = 30000, heartbeatTimeoutMs = 10000 }) {
  let stopped = false, socket = null, healthy = false, dirty = false, fetching = false;
  let reconnectTimer, fallbackTimer, expiryTimer, connectTimer, refreshTimer, heartbeatTimer, pongTimer;
  let retryAttempt = 0, fallbackDelay = fallbackBaseMs;
  const abort = new AbortController();
  const active = () => !stopped && isCurrent();
  const clear = timer => { if (timer != null) timers.clearTimeout(timer); };
  const visible = () => !documentRef?.hidden;
  const requestRefresh = () => {
    if (!active()) return;
    dirty = true;
    if (fetching) return;
    fetching = true;
    void (async () => {
      while (dirty && active()) {
        dirty = false;
        try {
          await refresh({signal:abort.signal, isCurrent:active});
          if (active()) { if (healthy) fallbackDelay = fallbackBaseMs; clear(refreshTimer); refreshTimer = null; }
        } catch (error) {
          if (!active()) break;
          onError(error);
          // A healthy socket does not guarantee snapshot HTTP availability.
          if (healthy && refreshTimer == null) refreshTimer = timers.setTimeout(() => { refreshTimer = null; requestRefresh(); }, fallbackBaseMs);
        }
      }
      fetching = false;
    })();
  };
  const scheduleFallback = () => {
    if (!active() || healthy || fallbackTimer != null) return;
    fallbackTimer = timers.setTimeout(() => {
      fallbackTimer = null;
      if (!active() || healthy) return;
      if (visible()) requestRefresh();
      fallbackDelay = Math.min(fallbackMaxMs, fallbackDelay * 2);
      scheduleFallback();
    }, fallbackDelay);
  };
  const clearHeartbeat = () => { clear(heartbeatTimer); clear(pongTimer); heartbeatTimer = null; pongTimer = null; };
  const scheduleHeartbeat = () => {
    clearHeartbeat();
    if (!active() || !healthy || !socket || !visible()) return;
    const current = socket;
    heartbeatTimer = timers.setTimeout(() => {
      heartbeatTimer = null;
      if (!active() || !healthy || socket !== current || !visible()) return;
      try { current.send('ping'); } catch { disconnect(); scheduleReconnect(); return; }
      pongTimer = timers.setTimeout(() => {
        pongTimer = null;
        if (active() && healthy && socket === current && visible()) { disconnect(); scheduleReconnect(); }
      }, heartbeatTimeoutMs);
    }, heartbeatIntervalMs);
  };
  const disconnect = () => {
    const previous = socket;
    socket = null; healthy = false;
    clearHeartbeat();
    clear(connectTimer); connectTimer = null;
    clear(expiryTimer); expiryTimer = null;
    if (previous) { try { previous.close(); } catch {} }
  };
  const scheduleReconnect = (delay) => {
    if (!active() || reconnectTimer != null) return;
    scheduleFallback();
    const jittered = delay == null ? Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(retryAttempt++, 10)) * (0.8 + random() * 0.4) : delay;
    reconnectTimer = timers.setTimeout(() => { reconnectTimer = null; void connect(); }, jittered);
  };
  const connect = async () => {
    if (!active() || socket) return;
    try {
      const grant = await getGrant({signal:abort.signal});
      if (!active()) return;
      if (grant?.enabled === false) { scheduleReconnect(disabledRetryMs); return; }
      const parsed = new URL(grant?.url);
      const expires = typeof grant.expiresAt === 'number' ? (grant.expiresAt < 1e12 ? grant.expiresAt * 1000 : grant.expiresAt) : Date.parse(grant.expiresAt);
      if (grant?.enabled !== true || parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search || parsed.hash || typeof grant.token !== 'string' || !/^[A-Za-z0-9._-]+$/.test(grant.token) || !Number.isFinite(expires) || expires <= now() + 5000) throw new Error('Invalid realtime grant');
      const next = socketFactory(parsed.href, ['docsbot.helpdesk.v1', `grant.${grant.token}`]);
      socket = next;
      connectTimer = timers.setTimeout(() => { if (socket === next && active() && !healthy) { disconnect(); scheduleReconnect(); } }, connectTimeoutMs);
      expiryTimer = timers.setTimeout(() => { if (socket === next && active()) { disconnect(); scheduleReconnect(0); } }, Math.max(0, expires - now() - 5000));
      next.onmessage = event => {
        if (!active() || socket !== next) return;
        if (event.data === 'pong') { scheduleHeartbeat(); return; }
        let frame; try { frame = JSON.parse(event.data); } catch { return; }
        if (frame?.v !== 1 || (frame.type !== 'ready' && frame.type !== 'invalidate')) return;
        if (frame.type === 'ready') {
          healthy = true; retryAttempt = 0;
          clear(connectTimer); connectTimer = null;
          clear(fallbackTimer); fallbackTimer = null;
          scheduleHeartbeat();
        }
        requestRefresh();
      };
      next.onclose = () => { if (active() && socket === next) { disconnect(); scheduleReconnect(); } };
      next.onerror = () => { if (active() && socket === next) { disconnect(); scheduleReconnect(); } };
    } catch {
      if (active()) { disconnect(); scheduleReconnect(); }
    }
  };
  const onVisibilityChange = () => { if (!active()) return; if (visible()) { requestRefresh(); scheduleHeartbeat(); } else clearHeartbeat(); };
  documentRef?.addEventListener?.('visibilitychange', onVisibilityChange);
  requestRefresh();
  scheduleFallback();
  void connect();
  return () => {
    stopped = true;
    abort.abort();
    documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange);
    clear(reconnectTimer); clear(fallbackTimer); clear(refreshTimer);
    disconnect();
  };
}
