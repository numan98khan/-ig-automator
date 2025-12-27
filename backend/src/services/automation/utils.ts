import { BusinessHoursConfig } from '../../types/automation';

export const DEFAULT_ACTIVE_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesKeywords(text: string, keywords: string[] = [], match: 'any' | 'all' = 'any'): boolean {
  if (!keywords.length) return true;
  const normalized = normalizeText(text);
  const checks = keywords.map(keyword => normalized.includes(normalizeText(keyword)));
  return match === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getTimezoneParts(timezone?: string, date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(part => {
    partMap[part.type] = part.value;
  });
  return {
    weekday: partMap.weekday,
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

function getWeekdayIndex(weekday: string | undefined): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekday && map[weekday] !== undefined ? map[weekday] : 0;
}

export function isOutsideBusinessHours(config?: BusinessHoursConfig, referenceDate: Date = new Date()): boolean {
  if (!config?.startTime || !config?.endTime) {
    return false;
  }
  const start = parseTimeToMinutes(config.startTime);
  const end = parseTimeToMinutes(config.endTime);
  if (start === null || end === null) {
    return false;
  }
  const parts = getTimezoneParts(config.timezone, referenceDate);
  const weekdayIndex = getWeekdayIndex(parts.weekday);
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : DEFAULT_ACTIVE_DAYS;
  if (!activeDays.includes(weekdayIndex)) {
    return true;
  }
  const nowMinutes = parts.hour * 60 + parts.minute;
  if (start === end) {
    return false;
  }
  if (start < end) {
    return nowMinutes < start || nowMinutes >= end;
  }
  return nowMinutes >= end && nowMinutes < start;
}

export function getNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): Date {
  const startMinutes = parseTimeToMinutes(config.startTime) || 0;
  const endMinutes = parseTimeToMinutes(config.endTime) || 0;
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : DEFAULT_ACTIVE_DAYS;

  const now = new Date(referenceDate);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let candidate = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const weekdayIndex = candidate.getDay();
    const isActiveDay = activeDays.includes(weekdayIndex);

    if (isActiveDay) {
      const withinWindow = startMinutes < endMinutes
        ? nowMinutes >= startMinutes && nowMinutes < endMinutes
        : nowMinutes >= startMinutes || nowMinutes < endMinutes;

      if (withinWindow && i === 0) {
        return candidate;
      }

      candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      if (i === 0 && nowMinutes < startMinutes && startMinutes < endMinutes) {
        return candidate;
      }
      if (i > 0) {
        return candidate;
      }
    }

    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return new Date(referenceDate);
}

export function formatNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): string {
  const nextOpen = getNextOpenTime(config, referenceDate);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextOpen);
  } catch (error) {
    return nextOpen.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
