function registerStatus(program) {
  program
    .command('status')
    .description('Displays a summary of all job states and the number of active workers.')
    .action(() => {
      console.log('status not implemented yet');
    });
}

module.exports = registerStatus;
