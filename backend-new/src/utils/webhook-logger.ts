import fs from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  type: 'webhook_verification' | 'webhook_received' | 'webhook_processed' | 'webhook_error' | 'api_call' | 'api_response';
  method?: string;
  url?: string;
  payload?: any;
  response?: any;
  error?: any;
  metadata?: any;
}

class WebhookLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'webhook-logs.json');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry, null, 2);
  }

  private writeToFile(entry: LogEntry) {
    try {
      const logLine = this.formatLog(entry) + ',\n';
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(entry: LogEntry) {
    // Console log with color coding
    const timestamp = new Date().toISOString();
    const color = this.getColorForType(entry.type);

    console.log(`\n${color}========================================`);
    console.log(`🕐 ${timestamp}`);
    console.log(`📋 TYPE: ${entry.type}`);

    if (entry.method && entry.url) {
      console.log(`🌐 ${entry.method} ${entry.url}`);
    }

    if (entry.payload) {
      console.log(`📥 PAYLOAD:`);
      console.log(JSON.stringify(entry.payload, null, 2));
    }

    if (entry.response) {
      console.log(`📤 RESPONSE:`);
      console.log(JSON.stringify(entry.response, null, 2));
    }

    if (entry.error) {
      console.log(`❌ ERROR:`);
      console.log(JSON.stringify(entry.error, null, 2));
    }

    if (entry.metadata) {
      console.log(`ℹ️  METADATA:`);
      console.log(JSON.stringify(entry.metadata, null, 2));
    }

    console.log(`========================================\x1b[0m\n`);

    // Write to file
    this.writeToFile({
      ...entry,
      timestamp,
    });
  }

  private getColorForType(type: LogEntry['type']): string {
    const colors = {
      webhook_verification: '\x1b[36m', // Cyan
      webhook_received: '\x1b[34m',     // Blue
      webhook_processed: '\x1b[32m',    // Green
      webhook_error: '\x1b[31m',        // Red
      api_call: '\x1b[33m',             // Yellow
      api_response: '\x1b[35m',         // Magenta
    };
    return colors[type] || '\x1b[37m'; // Default white
  }

  // Public logging methods
  logWebhookVerification(query: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_verification',
      method: 'GET',
      url: '/api/instagram/webhook',
      payload: query,
      metadata: {
        mode: query['hub.mode'],
        challenge: query['hub.challenge'],
        verify_token: query['hub.verify_token'] ? '***' : undefined,
      },
    });
  }

  logWebhookReceived(headers: any, body: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_received',
      method: 'POST',
      url: '/api/instagram/webhook',
      payload: body,
      metadata: {
        headers: {
          'x-hub-signature': headers['x-hub-signature'],
          'content-type': headers['content-type'],
        },
        entryCount: body?.entry?.length || 0,
      },
    });
  }

  logWebhookProcessed(eventType: string, data: any, result: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_processed',
      payload: data,
      response: result,
      metadata: {
        eventType,
        success: true,
      },
    });
  }

  logWebhookError(error: any, context?: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      metadata: context,
    });
  }

  logApiCall(endpoint: string, method: string, params: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'api_call',
      method,
      url: endpoint,
      payload: params,
      metadata: {
        apiType: 'Instagram Graph API',
      },
    });
  }

  logApiResponse(endpoint: string, status: number, data: any, error?: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'api_response',
      url: endpoint,
      response: {
        status,
        data: error ? undefined : data,
      },
      error: error ? {
        message: error.message,
        response: error.response?.data,
      } : undefined,
      metadata: {
        success: !error,
      },
    });
  }

  // Utility to get recent logs
  getRecentLogs(count: number = 50): LogEntry[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      // Remove trailing comma and newline, wrap in array
      const jsonArray = '[' + content.slice(0, -2) + ']';
      const logs = JSON.parse(jsonArray);
      return logs.slice(-count);
    } catch (error) {
      console.error('Failed to read logs:', error);
      return [];
    }
  }

  // Clear old logs (keep last N entries)
  rotateLogs(keepCount: number = 1000) {
    try {
      const logs = this.getRecentLogs(keepCount);
      const content = logs.map(log => JSON.stringify(log, null, 2)).join(',\n') + ',\n';
      fs.writeFileSync(this.logFile, content);
      console.log(`✅ Logs rotated, kept last ${logs.length} entries`);
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }
}

// Export singleton instance
export const webhookLogger = new WebhookLogger();
