const { Command } = require('commander');

const { loadConfig } = require('../config/configStore');
const { runCommand } = require('../core/executor');
const { calculateBackoffSeconds } = require('../core/retry');
const { listByState, updateJob } = require('../core/storage');

function parseWorkerCount(value) {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer');
  }

  return count;
}

function getOldestPendingJob() {
  const now = Date.now();

  return listByState('pending')
    .filter((job) => !job.next_run_at || new Date(job.next_run_at).getTime() <= now)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
}

function registerWorker(program) {
  const worker = new Command('worker')
    .description('Manages queue worker processes.');

  worker
    .command('start')
    .description('Starts one or more worker processes.')
    .requiredOption('--count <n>', 'Number of workers to start.')
    .action(async (options) => {
      try {
        parseWorkerCount(options.count);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      let completed = 0;
      let failed = 0;
      const config = loadConfig();
      let job = getOldestPendingJob();

      while (job) {
        const processingJob = updateJob(job.id, {
          state: 'processing',
          next_run_at: null,
        });

        const result = await runCommand(processingJob.command);
        const attempts = (processingJob.attempts ?? 0) + 1;
        const maxRetries = processingJob.max_retries ?? config.max_retries;

        if (result.success) {
          updateJob(processingJob.id, {
            state: 'completed',
            attempts,
            next_run_at: null,
          });
          completed += 1;
        } else if (attempts < maxRetries) {
          const backoffSeconds = calculateBackoffSeconds(attempts, config.backoff_base);
          const nextRunAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

          updateJob(processingJob.id, {
            state: 'pending',
            attempts,
            next_run_at: nextRunAt,
          });
        } else {
          updateJob(processingJob.id, {
            state: 'dead',
            attempts,
            next_run_at: null,
          });
          failed += 1;
        }

        job = getOldestPendingJob();
      }

      console.log(`${completed} completed, ${failed} failed`);
    });

  worker
    .command('stop')
    .description('Stops all running workers gracefully after completing their current jobs.')
    .action(() => {
      console.log('worker stop not implemented yet');
    });

  program.addCommand(worker);
}

module.exports = registerWorker;
