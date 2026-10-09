#!/usr/bin/env node

/**
 * cldcli — CLI для сборки приложений ColdOS.
 *
 * ColdOS исполняет JavaScript, поэтому приложения можно писать на разных
 * языках: исходник конвертируется в JS парсером соответствующего языка.
 */

import { parseArgs } from './cli/args.js';
import { log } from './core/logger.js';
import { fail } from './core/errors.js';
import { listLanguages } from './lang/index.js';
import { runInit } from './commands/init.js';
import { runBuild } from './commands/build.js';

const COMMANDS = {
  init: (args) => runInit(args._[1], args.flags),
  build: () => runBuild(),
  langs: () => showLangs()
};

function showLangs() {
  log.cyan('\nПоддерживаемые языки:\n');
  listLanguages().forEach((l) => {
    log.info(`  ${l.id.padEnd(8)} ${l.label}`);
    log.dim(`           ${l.notes}`);
  });
  log.dim('\nИспользование: cldcli init myapp --lang python\n');
}

function help() {
  log.cyan('\ncldcli — сборка приложений ColdOS\n');
  log.info('  cldcli init <name> [--lang <язык>]');
  log.dim('    --lang    ts | js | python | kotlin | go | php');
  log.dim('    --desc    описание приложения');
  log.dim('    --author  автор');
  log.dim('    --category категория');
  log.info('  cldcli build');
  log.info('  cldcli langs');
  log.dim('\nПример: cldcli init myapp --lang python\n');
}

try {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const run = COMMANDS[command];

  if (!run || args.flags.help) {
    help();
    process.exit(run ? 0 : 1);
  }

  await run(args);
} catch (error) {
  fail(error);
}