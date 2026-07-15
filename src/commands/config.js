const { Command } = require('commander');

function registerConfig(program) {
  const config = new Command('config')
    .description('Manages queue configuration values.');

  config
    .command('set')
    .argument('<key>', 'Configuration key to update.')
    .argument('<value>', 'Configuration value to set.')
    .description('Updates queue configuration values such as maximum retries, backoff policy, and other runtime settings.')
    .action(() => {
      console.log('config set not implemented yet');
    });

  program.addCommand(config);
}

module.exports = registerConfig;
