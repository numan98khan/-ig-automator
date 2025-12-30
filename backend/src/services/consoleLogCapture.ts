import util from 'node:util';
import { logAdminEvent } from './adminLogEventService';

let isInternalCapture = false;

const detectCategory = (message: string): string => {
  if (message.includes('[AUTOMATION]')) return 'automation';
  if (message.includes('[FLOW NODE]')) return 'flow_node';
  if (message.includes('AUTOMATION') && message.includes('Step')) return 'automation_step';
  if (message.includes('AI timing')) return 'ai_timing';
  if (message.includes('OpenAI') || message.includes('openai')) return 'openai_api';
  return 'console';
};

const buildMessage = (args: unknown[]) => util.format(...args);

export const initConsoleLogCapture = () => {
  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    if (!isInternalCapture) {
      const message = buildMessage(args);
      const category = detectCategory(message);
      isInternalCapture = true;
      void logAdminEvent({
        category,
        level: 'info',
        message,
      }).finally(() => {
        isInternalCapture = false;
      });
    }
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    if (!isInternalCapture) {
      const message = buildMessage(args);
      const category = detectCategory(message);
      isInternalCapture = true;
      void logAdminEvent({
        category,
        level: 'warn',
        message,
      }).finally(() => {
        isInternalCapture = false;
      });
    }
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    if (!isInternalCapture) {
      const message = buildMessage(args);
      const category = detectCategory(message);
      isInternalCapture = true;
      void logAdminEvent({
        category,
        level: 'error',
        message,
      }).finally(() => {
        isInternalCapture = false;
      });
    }
    originalError(...args);
  };
};
