const HUMAN_TYPING_PAUSE_MS = 3500; // Small pause to mimic human response timing
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function shouldPauseForTyping(): boolean {
  return HUMAN_TYPING_PAUSE_MS > 0;
}

export async function pauseForTypingIfNeeded(
): Promise<void> {
  if (shouldPauseForTyping()) {
    await wait(HUMAN_TYPING_PAUSE_MS);
  }
}
