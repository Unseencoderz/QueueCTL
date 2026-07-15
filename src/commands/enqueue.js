function registerEnqueue(program) {
  program
    .command('enqueue')
    .argument('<job-json>', 'JSON payload for the job to add to the queue.')
    .description('Adds a new job to the queue.')
    .action(() => {
      console.log('enqueue not implemented yet');
    });
}

module.exports = registerEnqueue;
