import util from 'node:util';
import { logAdminEvent } from './adminLogEventService';

let isInternalCapture = false;

const detectCategory = (message: string): string => {
  if (message.includes('[AUTOMATION]') || message.includes('Automation executed')) return 'automation';
  if (message.includes('[FLOW NODE]')) return 'flow_node';
  if (message.includes('AUTOMATION') && message.includes('Step')) return 'automation_step';
  if (message.includes('[AI]') || message.includes('reply_generated')) return 'ai';
  if (message.includes('[OpenAI]') || message.includes('openai')) return 'openai_api';
  if (message.includes('[IG-API]') || message.includes('IG API')) return 'ig_api';
  if (message.includes('Instagram webhook') || (message.includes('Payload') && message.includes('instagram'))) {
    return 'instagram_webhook';
  }
  if (message.includes('AI timing')) return 'ai_timing';
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
