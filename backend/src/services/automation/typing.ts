const HUMAN_TYPING_PAUSE_MS = 3500; // Small pause to mimic human response timing
const SKIP_TYPING_PAUSE_IN_SANDBOX =
  process.env.SANDBOX_SKIP_TYPING_PAUSE === 'true' || process.env.SANDBOX_SKIP_TYPING_PAUSE === '1';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function shouldPauseForTyping(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean },
): boolean {
  const isSandboxMock = platform === 'mock';
  const skipTypingPause = isSandboxMock && (SKIP_TYPING_PAUSE_IN_SANDBOX || settings?.skipTypingPauseInSandbox);

  return HUMAN_TYPING_PAUSE_MS > 0 && !skipTypingPause;
}

export async function pauseForTypingIfNeeded(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean },
): Promise<void> {
  if (shouldPauseForTyping(platform, settings)) {
    await wait(HUMAN_TYPING_PAUSE_MS);
  }
}
