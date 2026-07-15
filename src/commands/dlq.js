const { Command } = require('commander');

const { getJob, listByState, updateJob } = require('../core/storage');

function registerDlq(program) {
  const dlq = new Command('dlq')
    .description('Manages jobs in the Dead Letter Queue.');

  dlq
    .command('list')
    .description('Displays all jobs currently in the Dead Letter Queue.')
    .action(() => {
      const rows = listByState('dead').map((job) => ({
        id: job.id,
        state: job.state,
        command: job.command,
        attempts: job.attempts,
        updated_at: job.updated_at,
      }));

      console.table(rows);
    });

  dlq
    .command('retry')
    .argument('<id>', 'ID of the job to retry from the Dead Letter Queue.')
    .description('Retries the specified job from the Dead Letter Queue.')
    .action((id) => {
      const job = getJob(id);

      if (!job) {
        console.error(`Job ${id} not found`);
        process.exitCode = 1;
        return;
      }

      if (job.state !== 'dead') {
        console.error(`Job ${id} is not in the Dead Letter Queue`);
        process.exitCode = 1;
        return;
      }

      const retriedJob = updateJob(id, {
        attempts: 0,
        state: 'pending',
        next_run_at: null,
      });

      console.log(`Job ${retriedJob.id} moved back to pending`);
    });

  program.addCommand(dlq);
}

module.exports = registerDlq;
