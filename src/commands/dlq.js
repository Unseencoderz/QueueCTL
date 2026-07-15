const { Command } = require('commander');

function registerDlq(program) {
  const dlq = new Command('dlq')
    .description('Manages jobs in the Dead Letter Queue.');

  dlq
    .command('list')
    .description('Displays all jobs currently in the Dead Letter Queue.')
    .action(() => {
      console.log('dlq list not implemented yet');
    });

  dlq
    .command('retry')
    .argument('<id>', 'ID of the job to retry from the Dead Letter Queue.')
    .description('Retries the specified job from the Dead Letter Queue.')
    .action(() => {
      console.log('dlq retry not implemented yet');
    });

  program.addCommand(dlq);
}

module.exports = registerDlq;
