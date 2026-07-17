#!/usr/bin/env node

import { runInit } from './commands/init.js';
import { runBuild } from './commands/build.js';
import { log } from './utils/logger.js';

const [,, command, arg2] = process.argv;

if (command === 'init') {
  await runInit(arg2);
  process.exit(0);
} else if (command === 'build') {
  await runBuild();
  process.exit(0);
} else {
  log.error('\nНеизвестная команда.');
  log.cyan('Доступные команды: cldcli init <name> | cldcli build\n');
  process.exit(1);
}