function registerList(program) {
  program
    .command('list')
    .description('Lists all jobs in the specified state (e.g., pending, running, completed, failed).')
    .requiredOption('--state <state>', 'Filter jobs by state.')
    .action(() => {
      console.log('list not implemented yet');
    });
}

module.exports = registerList;
