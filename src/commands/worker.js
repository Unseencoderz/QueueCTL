const { Command } = require('commander');

const { runCommand } = require('../core/executor');
const { listByState, updateJob } = require('../core/storage');

function parseWorkerCount(value) {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer');
  }

  return count;
}

function getOldestPendingJob() {
  return listByState('pending')
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
      let job = getOldestPendingJob();

      while (job) {
        const processingJob = updateJob(job.id, {
          state: 'processing',
        });

        const result = await runCommand(processingJob.command);
        const attempts = (processingJob.attempts ?? 0) + 1;
        const nextState = result.success ? 'completed' : 'failed';

        updateJob(processingJob.id, {
          state: nextState,
          attempts,
        });

        if (result.success) {
          completed += 1;
        } else {
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
