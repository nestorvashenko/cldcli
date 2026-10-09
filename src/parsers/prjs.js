/**
 * JavaScript -> JavaScript.
 *
 * ColdOS исполняет JS, поэтому здесь только нормализация:
 * снятие комментариев, обрезка модульной обёртки, проверка точки входа.
 */

import { ParseError } from '../core/errors.js';
import { scan } from './shared/scanner.js';
import { ENTRY_RE, hasEntry, stripModuleWrapper } from './shared/entry.js';

export const id = 'js';

export function validate(source, ctx = {}) {
  const lines = scan(source, { lineComment: '//', blockComment: true, backtick: true });
  const clean = stripModuleWrapper(lines.map((l) => l.text).join('\n'));
  const fn = entryName(clean, ctx);

  if (!fn) {
    throw new ParseError(
      'js',
      'Не найдена точка входа — функция user_run_application_<id>().',
      'Определите функцию user_run_application_' + (ctx.appId || 'myapp') + '() { ... }',
      1
    );
  }
  return fn;
}

export function parse(source, ctx = {}) {
  const lines = scan(source, { lineComment: '//', blockComment: true, backtick: true });
  let code = stripModuleWrapper(lines.map((l) => l.text).join('\n'));
  const fn = entryName(code, ctx);
  return { code, entryName: fn };
}

function entryName(code, ctx) {
  const expected = ENTRY_RE(ctx.appId);
  if (expected.test(code)) return ctx.appId;
  const generic = hasEntry(code);
  return generic;
}