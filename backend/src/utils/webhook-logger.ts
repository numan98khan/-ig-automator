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

  private writeToFile(entry: LogEntry) {
    try {
      const logLine = JSON.stringify(entry, null, 2) + ',\n';
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(entry: LogEntry) {
    const timestamp = new Date().toISOString();

    // DISABLED: Simple console output - just dump everything raw
    // console.log('\n' + '='.repeat(80));
    // console.log(`[${timestamp}] ${entry.type.toUpperCase()}`);
    // console.log('='.repeat(80));
    // console.log('RAW DATA:');
    // console.log(JSON.stringify(entry, null, 2));
    // console.log('='.repeat(80) + '\n');

    // Write to file
    this.writeToFile({
      ...entry,
      timestamp,
    });
  }

  // Public logging methods
  logWebhookVerification(query: any) {
    // DISABLED: console.log('\n🔔 WEBHOOK VERIFICATION');
    // DISABLED: console.log('RAW QUERY:', JSON.stringify(query, null, 2));

    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_verification',
      method: 'GET',
      url: '/api/instagram/webhook',
      payload: query,
    });
  }

  logWebhookReceived(headers: any, body: any) {
    // DISABLED: console.log('\n📨 WEBHOOK RECEIVED');
    // DISABLED: console.log('RAW HEADERS:', JSON.stringify(headers, null, 2));
    // DISABLED: console.log('RAW BODY:', JSON.stringify(body, null, 2));

    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_received',
      method: 'POST',
      url: '/api/instagram/webhook',
      payload: { headers, body },
    });
  }

  logWebhookProcessed(eventType: string, data: any, result: any) {
    // DISABLED: console.log('\n✅ WEBHOOK PROCESSED');
    // DISABLED: console.log('EVENT TYPE:', eventType);
    // DISABLED: console.log('RAW DATA:', JSON.stringify(data, null, 2));
    // DISABLED: console.log('RAW RESULT:', JSON.stringify(result, null, 2));

    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_processed',
      payload: data,
      response: result,
      metadata: { eventType },
    });
  }

  logWebhookError(error: any, context?: any) {
    // DISABLED: console.log('\n❌ WEBHOOK ERROR');
    // DISABLED: console.log('RAW ERROR:', JSON.stringify({
    //   message: error.message,
    //   stack: error.stack,
    //   name: error.name,
    //   ...error
    // }, null, 2));
    // DISABLED: console.log('RAW CONTEXT:', JSON.stringify(context, null, 2));

    this.log({
      timestamp: new Date().toISOString(),
      type: 'webhook_error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        raw: error,
      },
      metadata: context,
    });
  }

  logApiCall(endpoint: string, method: string, params: any) {
    // DISABLED: console.log('\n🌐 API CALL');
    // DISABLED: console.log('METHOD:', method);
    // DISABLED: console.log('ENDPOINT:', endpoint);
    // DISABLED: console.log('RAW PARAMS:', JSON.stringify(params, null, 2));

    this.log({
      timestamp: new Date().toISOString(),
      type: 'api_call',
      method,
      url: endpoint,
      payload: params,
    });
  }

  logApiResponse(endpoint: string, status: number, data: any, error?: any) {
    // DISABLED: console.log('\n📡 API RESPONSE');
    // DISABLED: console.log('ENDPOINT:', endpoint);
    // DISABLED: console.log('STATUS:', status);
    // DISABLED: if (error) {
    //   console.log('RAW ERROR:', JSON.stringify({
    //     message: error.message,
    //     response: error.response?.data,
    //     raw: error
    //   }, null, 2));
    // } else {
    //   console.log('RAW DATA:', JSON.stringify(data, null, 2));
    // }

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
        raw: error,
      } : undefined,
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
