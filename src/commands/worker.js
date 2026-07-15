const { Command } = require('commander');

function registerWorker(program) {
  const worker = new Command('worker')
    .description('Manages queue worker processes.');

  worker
    .command('start')
    .description('Starts one or more worker processes.')
    .requiredOption('--count <n>', 'Number of workers to start.')
    .action(() => {
      console.log('worker start not implemented yet');
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
