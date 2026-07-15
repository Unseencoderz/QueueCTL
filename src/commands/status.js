const { listJobs } = require('../core/storage');

function registerStatus(program) {
  program
    .command('status')
    .description('Displays a summary of all job states and the number of active workers.')
    .action(() => {
      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        dead: 0,
      };

      for (const job of listJobs()) {
        if (Object.prototype.hasOwnProperty.call(counts, job.state)) {
          counts[job.state] += 1;
        }
      }

      for (const [state, count] of Object.entries(counts)) {
        console.log(`${state}: ${count}`);
      }

      console.log('active workers: 0');
    });
}

module.exports = registerStatus;
