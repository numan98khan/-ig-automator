import AdminLogSettings from '../models/AdminLogSettings';

export type AdminLogSettingsSnapshot = {
  aiTimingEnabled: boolean;
  aiLogsEnabled: boolean;
  automationLogsEnabled: boolean;
  automationStepsEnabled: boolean;
  instagramWebhookLogsEnabled: boolean;
  igApiLogsEnabled: boolean;
  openaiApiLogsEnabled: boolean;
  consoleLogsEnabled: boolean;
};

const DEFAULT_SETTINGS: AdminLogSettingsSnapshot = {
  aiTimingEnabled: true,
  aiLogsEnabled: true,
  automationLogsEnabled: true,
  automationStepsEnabled: true,
  instagramWebhookLogsEnabled: true,
  igApiLogsEnabled: true,
  openaiApiLogsEnabled: false,
  consoleLogsEnabled: false,
};

const CACHE_TTL_MS = 30000;

let cachedSettings: AdminLogSettingsSnapshot = { ...DEFAULT_SETTINGS };
let lastFetchedAt = 0;
let refreshPromise: Promise<void> | null = null;

const toSnapshot = (doc: any): AdminLogSettingsSnapshot => ({
  aiTimingEnabled: doc?.aiTimingEnabled ?? DEFAULT_SETTINGS.aiTimingEnabled,
  aiLogsEnabled: doc?.aiLogsEnabled ?? DEFAULT_SETTINGS.aiLogsEnabled,
  automationLogsEnabled: doc?.automationLogsEnabled ?? DEFAULT_SETTINGS.automationLogsEnabled,
  automationStepsEnabled: doc?.automationStepsEnabled ?? DEFAULT_SETTINGS.automationStepsEnabled,
  instagramWebhookLogsEnabled: doc?.instagramWebhookLogsEnabled ?? DEFAULT_SETTINGS.instagramWebhookLogsEnabled,
  igApiLogsEnabled: doc?.igApiLogsEnabled ?? DEFAULT_SETTINGS.igApiLogsEnabled,
  openaiApiLogsEnabled: doc?.openaiApiLogsEnabled ?? DEFAULT_SETTINGS.openaiApiLogsEnabled,
  consoleLogsEnabled: doc?.consoleLogsEnabled ?? DEFAULT_SETTINGS.consoleLogsEnabled,
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
  if (typeof updates.aiLogsEnabled === 'boolean') {
    updatePayload.aiLogsEnabled = updates.aiLogsEnabled;
  }
  if (typeof updates.automationLogsEnabled === 'boolean') {
    updatePayload.automationLogsEnabled = updates.automationLogsEnabled;
  }
  if (typeof updates.automationStepsEnabled === 'boolean') {
    updatePayload.automationStepsEnabled = updates.automationStepsEnabled;
  }
  if (typeof updates.instagramWebhookLogsEnabled === 'boolean') {
    updatePayload.instagramWebhookLogsEnabled = updates.instagramWebhookLogsEnabled;
  }
  if (typeof updates.igApiLogsEnabled === 'boolean') {
    updatePayload.igApiLogsEnabled = updates.igApiLogsEnabled;
  }
  if (typeof updates.openaiApiLogsEnabled === 'boolean') {
    updatePayload.openaiApiLogsEnabled = updates.openaiApiLogsEnabled;
  }
  if (typeof updates.consoleLogsEnabled === 'boolean') {
    updatePayload.consoleLogsEnabled = updates.consoleLogsEnabled;
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
