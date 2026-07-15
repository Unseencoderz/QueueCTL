const { spawn } = require('child_process');

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        error,
      });
    });

    child.on('close', (exitCode) => {
      resolve({
        success: exitCode === 0,
        exitCode,
      });
    });
  });
}

module.exports = {
  runCommand,
};
