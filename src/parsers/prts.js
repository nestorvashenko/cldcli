/**
 * TypeScript -> JavaScript.
 *
 * Типы снимает esbuild (единственный в проекте трансформатор, который
 * работает без внешнего тулчейна), остальное — как в prjs.js.
 */

import * as esbuild from 'esbuild';
import { ParseError } from '../core/errors.js';
import { ENTRY_RE, hasEntry } from './shared/entry.js';

export const id = 'ts';

export async function validate(source, ctx = {}) {
  const out = await transform(source, ctx);
  return entryName(out, ctx);
}

export async function parse(source, ctx = {}) {
  const out = await transform(source, ctx);
  return { code: out, entryName: entryName(out, ctx) };
}

async function transform(source, ctx) {
  try {
    const result = await esbuild.transform(source, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      charset: 'utf8'
    });
    return result.code;
  } catch (error) {
    const line = error?.location?.line;
    throw new ParseError(
      'ts',
      'Не удалось скомпилировать TypeScript.',
      error?.errors?.[0]?.text || 'Проверьте синтаксис main.ts',
      line
    );
  }
}

function entryName(code, ctx) {
  if (ENTRY_RE(ctx.appId).test(code)) return ctx.appId;
  return hasEntry(code);
}