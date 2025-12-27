import AdminLogSettings from '../models/AdminLogSettings';

export type AdminLogSettingsSnapshot = {
  aiTimingEnabled: boolean;
  automationLogsEnabled: boolean;
  automationStepsEnabled: boolean;
};

const DEFAULT_SETTINGS: AdminLogSettingsSnapshot = {
  aiTimingEnabled: true,
  automationLogsEnabled: true,
  automationStepsEnabled: true,
};

const CACHE_TTL_MS = 30000;

let cachedSettings: AdminLogSettingsSnapshot = { ...DEFAULT_SETTINGS };
let lastFetchedAt = 0;
let refreshPromise: Promise<void> | null = null;

const toSnapshot = (doc: any): AdminLogSettingsSnapshot => ({
  aiTimingEnabled: doc?.aiTimingEnabled ?? DEFAULT_SETTINGS.aiTimingEnabled,
  automationLogsEnabled: doc?.automationLogsEnabled ?? DEFAULT_SETTINGS.automationLogsEnabled,
  automationStepsEnabled: doc?.automationStepsEnabled ?? DEFAULT_SETTINGS.automationStepsEnabled,
});

const refreshLogSettings = async (force = false): Promise<void> => {
  if (!force && Date.now() - lastFetchedAt < CACHE_TTL_MS) return;
  try {
    const settings = await AdminLogSettings.findOneAndUpdate(
      {},
      { $setOnInsert: DEFAULT_SETTINGS },
      { new: true, upsert: true },
    ).lean();
    cachedSettings = toSnapshot(settings);
    lastFetchedAt = Date.now();
  } catch (error) {
    console.error('Failed to refresh admin log settings:', error);
  }
};

const ensureFreshAsync = () => {
  if (Date.now() - lastFetchedAt < CACHE_TTL_MS) return;
  if (refreshPromise) return;
  refreshPromise = refreshLogSettings()
    .catch(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
};

export const getLogSettingsSnapshot = (): AdminLogSettingsSnapshot => {
  ensureFreshAsync();
  return cachedSettings;
};

export const getLogSettings = async (): Promise<AdminLogSettingsSnapshot> => {
  await refreshLogSettings(true);
  return cachedSettings;
};

export const updateLogSettings = async (
  updates: Partial<AdminLogSettingsSnapshot>,
): Promise<AdminLogSettingsSnapshot> => {
  const updatePayload: Partial<AdminLogSettingsSnapshot> = {};

  if (typeof updates.aiTimingEnabled === 'boolean') {
    updatePayload.aiTimingEnabled = updates.aiTimingEnabled;
  }
  if (typeof updates.automationLogsEnabled === 'boolean') {
    updatePayload.automationLogsEnabled = updates.automationLogsEnabled;
  }
  if (typeof updates.automationStepsEnabled === 'boolean') {
    updatePayload.automationStepsEnabled = updates.automationStepsEnabled;
  }

  if (Object.keys(updatePayload).length === 0) {
    await refreshLogSettings(true);
    return cachedSettings;
  }

  const insertPayload: Partial<AdminLogSettingsSnapshot> = { ...DEFAULT_SETTINGS };
  (Object.keys(updatePayload) as Array<keyof AdminLogSettingsSnapshot>).forEach((key) => {
    delete insertPayload[key];
  });

  const settings = await AdminLogSettings.findOneAndUpdate(
    {},
    { $set: updatePayload, $setOnInsert: insertPayload },
    { new: true, upsert: true },
  ).lean();

  cachedSettings = toSnapshot(settings);
  lastFetchedAt = Date.now();
  return cachedSettings;
};
