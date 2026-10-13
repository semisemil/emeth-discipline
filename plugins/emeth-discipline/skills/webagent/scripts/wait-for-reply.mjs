const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function inspectReplyState(state, marker, {
  copyLabels = ['응답 복사', 'Copy response'],
  stopLabels = ['답변 중지', 'Stop generating', 'Stop response'],
} = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(marker)) throw new Error('Use a unique ASCII marker.');
  const lines = state.split('\n');
  const button = labels => new RegExp(`\\bbutton(?: Description:)? (?:${labels.map(escape).join('|')})(?:,|$)`);
  const markerIndex = lines.findIndex(line => new RegExp(`\\btext ${escape(marker)}\\s*$`).test(line));
  const following = markerIndex < 0 ? [] : lines.slice(markerIndex + 1);
  const copyIndex = following.findIndex(line => button(copyLabels).test(line));
  const userIndex = following.findIndex(line => /내 메시지 작업|Your message actions|text entry area/.test(line));
  return {
    copies: lines.filter(line => button(copyLabels).test(line)).length,
    running: lines.some(line => button(stopLabels).test(line)),
    markerFound: markerIndex >= 0,
    responseActions: copyIndex >= 0 && (userIndex < 0 || copyIndex < userIndex),
  };
}

// The supplied tab is owned by the Browser runtime. This helper only reads UI.
export async function waitForReply(tab, {
  marker, timeoutMs = 50000, pollMs = 2000, ...labels
}) {
  if (!(timeoutMs > 0 && timeoutMs <= 50000) || !(pollMs >= 0 && pollMs <= 5000)) throw new Error('Invalid wait bounds.');
  inspectReplyState('', marker, labels);
  const started = Date.now();
  let checks = 0;
  let sawRunning = false;
  let state;
  while (Date.now() - started < timeoutMs) {
    try {
      state = inspectReplyState(await tab.ax.get('state', { disableDiffing: true }), marker, labels);
      checks++;
      sawRunning ||= state.running;
      if (state.markerFound && state.responseActions && !state.running) {
        return { status: 'completed', checks, sawRunning, elapsedMs: Date.now() - started };
      }
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining > 0) await tab.playwright.waitForTimeout(Math.min(pollMs, remaining));
    } catch (error) {
      return { status: 'observation_error', checks, sawRunning, elapsedMs: Date.now() - started, error: String(error) };
    }
  }
  return { status: 'pending', checks, sawRunning, elapsedMs: Date.now() - started, lastState: state };
}
