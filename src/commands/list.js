const { listByState, listJobs } = require('../core/storage');

function registerList(program) {
  program
    .command('list')
    .description('Lists all jobs in the specified state (e.g., pending, running, completed, failed).')
    .option('--state <state>', 'Filter jobs by state.')
    .action((options) => {
      const jobs = options.state ? listByState(options.state) : listJobs();
      const rows = jobs.map((job) => ({
        id: job.id,
        state: job.state,
        attempts: job.attempts,
        command: job.command,
        updated_at: job.updated_at,
      }));

      console.table(rows);
    });
}

module.exports = registerList;
