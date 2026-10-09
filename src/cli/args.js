/**
 * Разбор аргументов командной строки.
 *
 * Поддерживается формат --key value и --flag.
 */

export function parseArgs(argv) {
  const args = { _: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];

      if (next === undefined || next.startsWith('--')) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i++;
      }
      continue;
    }

    args._.push(token);
  }

  return args;
}