/**
 * Kotlin -> JavaScript (подмножество).
 *
 * Поддерживается ровно то, что нужно приложению ColdOS:
 *   fun name(a: T): Unit { }   -> function name(a) { }
 *   val / var x = e            -> const x = e
 *   "текст $x ${y}"            -> `текст ${x} ${y}`
 *   mapOf("k" to v)            -> { k: v }
 *   listOf(a, b) / mutableListOf -> [a, b]
 *   if (c) { } else { }        -> if (c) { } else { }
 *   return                      -> return;
 *   println(...)                -> console.log(...)
 *   Window_add(...)             -> Window_add(...)
 *
 * Не поддерживается: классы, data-классы, лямбды с Receiver, циклы,
 * корутины, аннотации, extension-функции, generics на уровне функции.
 */

import { ParseError } from '../core/errors.js';
import { scan, joinContinuations } from './shared/scanner.js';
import { jsTemplate, jsString } from './shared/emit.js';
import { entryName } from './shared/entry.js';

export const id = 'kotlin';

const KT_BUILTINS = {
  println: 'console.log',
  print: 'console.log',
  true: 'true',
  false: 'false',
  null: 'null'
};

export async function validate(source, ctx = {}) {
  return parse(source, ctx).entryName;
}

export function parse(source, ctx = {}) {
  const lines = joinContinuations(
    scan(source, { lineComment: '//', blockComment: true, tripleQuotes: true })
  );
  return convert(lines, ctx);
}

function convert(lines, ctx) {
  const out = [];
  const stack = []; // { indent, kind }
  let foundEntry = false;

  lines.forEach((line, idx) => {
    const no = idx + 1;
    let text = line.text.trim();
    if (!text) return;
    const indent = line.indent;

    // Явная закрывающая скобка закрывает ровно один блок
    if (text.startsWith('}')) {
      const closed = stack.pop();
      out.push(closed ? '  '.repeat(Math.floor(closed.indent / 2)) + '}' : '}');
      text = text.slice(1).trim();
      if (!text) return;
    }

    while (stack.length && indent <= stack[stack.length - 1].indent) {
      out.push('  '.repeat(Math.floor(stack.pop().indent / 2)) + '}');
    }

    if (/^(package|import)\s/.test(text)) return;

    // Закрываем одиночный блок на той же строке: if (c) { ... }
    const inlineOpen = /\{\s*$/.test(text);
    const inlineClose = /^\s*\}/.test(text);

    const funM = /^fun\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{\s*$/.exec(text);
    if (funM) {
      const name = funM[1];
      const params = funM[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.split(':')[0].trim() + (p.includes('=') ? ' = ' + expr(p.split('=').slice(1).join('='), no) : ''))
        .join(', ');
      const renamed = name.startsWith('user_run_application')
        ? (ctx.appId ? entryName(ctx.appId) : name)
        : name;
      if (name.startsWith('user_run_application')) foundEntry = true;
      out.push('  '.repeat(Math.floor(indent / 2)) + `function ${renamed}(${params}) {`);
      stack.push({ indent, kind: 'fun' });
      return;
    }

    if (/^(if|while|else if|for)\s*\(/.test(text) || /^else\s*\{\s*$/.test(text)) {
      const head = text.replace(/\s*\{\s*$/, '').trim();
      const kw = head.split('(')[0].trim();
      const cond = expr(head.slice(head.indexOf('(') + 1, head.lastIndexOf(')')), no);
      const jsHead = kw === 'if' || kw === 'while' || kw === 'else if'
          ? `${kw} (${cond}) {`
          : `${head} {`;
      out.push('  '.repeat(Math.floor(indent / 2)) + jsHead);
      if (inlineOpen) stack.push({ indent, kind: 'block' });
      return;
    }

    if (inlineClose) {
      return;
    }

    const valM = /^(val|var)\s+([A-Za-z_]\w*)\s*(?::\s*[\w<>?\[\]\.]+)?\s*=\s*([\s\S]+)$/.exec(text);
    if (valM) {
      out.push(`${'  '.repeat(Math.floor(indent / 2))}const ${valM[2]} = ${expr(valM[3], no)};`);
      return;
    }

    const retM = /^return\b\s*([\s\S]*)$/.exec(text);
    if (retM) {
      out.push('  '.repeat(Math.floor(indent / 2)) + `return${retM[1].trim() ? ' ' + expr(retM[1].trim(), no) : ''};`);
      return;
    }

    if (/^[A-Za-z_][\w.]*\s*\(/.test(text)) {
      out.push('  '.repeat(Math.floor(indent / 2)) + expr(text, no) + ';');
      return;
    }

    throw new ParseError(
      'kotlin',
      `Не поддерживается конструкция: ${text.slice(0, 60)}`,
      'Поддерживаются: fun, val/var, if, return, строковые шаблоны, mapOf, вызовы функций.',
      no
    );
  });

  while (stack.length) {
    out.push('  '.repeat(Math.floor(stack.pop().indent / 2)) + '}');
  }

  if (!foundEntry) {
    throw new ParseError(
      'kotlin',
      'Не найдена функция user_run_application_<id>().',
      'В шаблоне должна быть ровно одна функция точка входа.',
      1
    );
  }

  return { code: out.filter(Boolean).join('\n') + '\n', entryName: ctx.appId || null };
}

function expr(src, lineNo) {
  let s = src.trim().replace(/\s*\{\s*$/, '').trim();

  // mapOf("a" to 1, ...) / mutableMapOf
  const map = /^(?:mutableMapOf|mapOf)\(([\s\S]*)\)$/.exec(s);
  if (map) {
    const inner = map[1].trim();
    if (!inner) return '{}';
    return '{ ' + splitTop(inner).map((p) => toPair(p, lineNo)).join(', ') + ' }';
  }

  const list = /^(?:mutableListOf|listOf|setOf|mutableSetOf)\(([\s\S]*)\)$/.exec(s);
  if (list) {
    const inner = list[1].trim();
    if (!inner) return '[]';
    return '[' + splitTop(inner).map((v) => expr(v.trim(), lineNo)).join(', ') + ']';
  }

  // многострочный шаблон """..."""
  const tripleTpl = /^\$?"""([\s\S]*)"""$/.exec(s);
  if (tripleTpl) return jsTemplate(tripleTpl[1], 'kotlin');

  // "шаблон $x"
  const tpl = /^"([\s\S]*)"$/.exec(s);
  if (tpl) return jsTemplate(tpl[1], 'kotlin');

  if (/^(['"])([\\'"]*)\1$/.test(s)) return jsString(s.slice(1, -1));

  return convertFragment(s, lineNo);
}

function toPair(pair, lineNo) {
  const idx = pair.indexOf(' to ');
  if (idx === -1) {
    throw new ParseError('kotlin', `Ожидалась пара "ключ" to значение: ${pair.trim()}`, '', lineNo);
  }
  const rawKey = pair.slice(0, idx).trim().replace(/^"([\s\S]*)"$/, '$1');
  const key = /^[A-Za-z_$][\w$]*$/.test(rawKey) ? rawKey : jsString(rawKey);
  return `${key}: ${expr(pair.slice(idx + 4).trim(), lineNo)}`;
}

function convertFragment(s, lineNo) {
  let out = s;
  Object.keys(KT_BUILTINS).forEach((k) => {
    out = out.replace(new RegExp(`(^|[^\\w.$])${k}(?![\\w])`, 'g'), (m, p1) => p1 + KT_BUILTINS[k]);
  });
  out = out.replace(/==/g, '===').replace(/!=/g, '!==').replace(/&&/g, '&&').replace(/\|\|/g, '||');
  // лямбды вида { it -> ... } не поддерживаются осознанно
  if (/->/.test(out)) {
    throw new ParseError('kotlin', 'Лямбды (->) не поддерживаются.', '', lineNo);
  }
  return out;
}

function splitTop(s) {
  const out = [];
  let depth = 0;
  let quote = null;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') buf += s[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (depth === 0 && ch === ',') {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}