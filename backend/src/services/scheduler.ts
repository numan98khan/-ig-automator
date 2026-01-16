import { processDueFollowups, processDueMessageBuffers } from './automationService';
import { rebuildYesterdayReports } from './reportingService';

/**
 * Simple in-memory scheduler for background jobs
 * Uses setInterval for periodic task execution
 */

class Scheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running');
      return;
    }

    console.log('🚀 Starting background job scheduler...');
    this.isRunning = true;

    // Schedule follow-up processing every 5 minutes
    this.scheduleJob('followup-processor', 5 * 60 * 1000, async () => {
      console.log('⏰ Running follow-up processor...');
      try {
        const stats = await processDueFollowups();
        if (stats.processed > 0) {
          console.log(`📊 Follow-up stats: ${JSON.stringify(stats)}`);
        }
      } catch (error) {
        console.error('❌ Error in follow-up processor:', error);
      }
    });

    // Schedule message buffer processing every 15 seconds
    this.scheduleJob('message-buffer-processor', 15 * 1000, async () => {
      try {
        const stats = await processDueMessageBuffers();
        if (stats.processed > 0 || stats.failed > 0) {
          console.log(`🧺 Message buffer stats: ${JSON.stringify(stats)}`);
        }
      } catch (error) {
        console.error('❌ Error in message buffer processor:', error);
      }
    });

    // Rebuild daily reports once per day as a safety net
    this.scheduleJob('daily-report-rebuild', 24 * 60 * 60 * 1000, async () => {
      console.log('🧹 Rebuilding yesterday dashboard reports...');
      try {
        await rebuildYesterdayReports();
        console.log('✅ Daily reports rebuilt');
      } catch (error) {
        console.error('❌ Error rebuilding reports:', error);
      }
    });

    console.log('✅ Scheduler started with the following jobs:');
    console.log('   - Follow-up processor: every 5 minutes');
    console.log('   - Message buffer processor: every 15 seconds');
    console.log('   - Daily report rebuild: every 24 hours');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Scheduler not running');
      return;
    }

    console.log('🛑 Stopping scheduler...');

    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      console.log(`   - Stopped job: ${name}`);
    }

    this.intervals.clear();
    this.isRunning = false;
    console.log('✅ Scheduler stopped');
  }

  /**
   * Schedule a recurring job
   */
  private scheduleJob(name: string, intervalMs: number, task: () => Promise<void>) {
    // Run immediately on startup
    task().catch(err => console.error(`❌ Error in ${name} initial run:`, err));

    // Then schedule recurring execution
    const interval = setInterval(() => {
      task().catch(err => console.error(`❌ Error in ${name}:`, err));
    }, intervalMs);

    this.intervals.set(name, interval);
  }

  /**
   * Check if scheduler is running
   */
  getStatus(): { running: boolean; jobs: string[] } {
    return {
      running: this.isRunning,
      jobs: Array.from(this.intervals.keys()),
    };
  }

  /**
   * Manually trigger follow-up processing
   */
  async triggerFollowupProcessing(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    cancelled: number;
  }> {
    console.log('🔧 Manually triggering follow-up processing...');
    return await processDueFollowups();
  }
}

// Export singleton instance
export const scheduler = new Scheduler();
