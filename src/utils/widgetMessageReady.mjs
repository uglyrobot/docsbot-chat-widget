// Wait for React's message effect, not merely the panel's open state update.
export function waitForMessageHandler(emitter, timeoutMs = 5000) {
  if (emitter.listenerCount('docsbot_add_user_message')) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (ready) => {
      clearTimeout(timer);
      emitter.off('docsbot_message_ready', onReady);
      emitter.off('docsbot_unmount', onUnmount);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onUnmount = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    emitter.once('docsbot_message_ready', onReady);
    emitter.once('docsbot_unmount', onUnmount);
  });
}
