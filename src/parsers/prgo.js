/**
 * Go -> JavaScript (подмножество).
 *
 * Поддерживается:
 *   package main                  -> отбрасывается
 *   func user_run_application_x() { } -> function user_run_application_x() { }
 *   x := "s" / var x = "s"        -> const x = "s";
 *   `шаблон ${x}`                 -> `шаблон ${x}`
 *   map[string]interface{}{"k": v}-> { k: v }
 *   []string{...} / []int{...}    -> [ ... ]
 *   fmt.Println(...)              -> console.log(...)
 *   if cond { } else { }          -> if (cond) { } else { }
 *   return                        -> return;
 *
 * Не поддерживается: goroutine, select, defer, интерфейсы, структуры,
 * каналы, slices, generics, циклы for/range.
 */

import { ParseError } from '../core/errors.js';
import { scan } from './shared/scanner.js';
import { jsTemplate, jsString } from './shared/emit.js';
import { entryName } from './shared/entry.js';

export const id = 'go';

const GO_BUILTINS = {
  'fmt.Println': 'console.log',
  'fmt.Print': 'console.log',
  'fmt.Sprintf': '__sprintf',
  'fmt.Sprint': 'String',
  'true': 'true',
  'false': 'false',
  'nil': 'null'
};

export async function validate(source, ctx = {}) {
  return parse(source, ctx).entryName;
}

export function parse(source, ctx = {}) {
  const lines = scan(source, { lineComment: '//', blockComment: true, backtick: true });
  return convert(joinGoLiterals(lines), ctx);
}

/**
 * Склеивает многострочные составные литералы:
 *   config := map[string]interface{}{
 *       "enabled": true,
 *   }
 * Фигурные скобки блоков (func/if) при этом не трогаются — в отличие от
 * наивного joinContinuations, который схлопнул бы всё тело функции.
 */
function joinGoLiterals(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();

    const startsLiteral =
      /:=\s*(map\[|\[\]|struct\s*\{|[\w\.]+\{)/.test(text) ||
      /^\s*(map\[|\[\]|struct\s*\{)/.test(text) ||
      /\{\s*$/.test(text) && !/^(func|if|for|else|switch|\})/.test(text);

    if (!startsLiteral || !/{\s*$/.test(text)) {
      out.push(line);
      continue;
    }

    let buf = text;
    let j = i + 1;
    while (j < lines.length) {
      buf += ' ' + lines[j].text.trim();
      const opens = (buf.match(/\{/g) || []).length;
      const closes = (buf.match(/\}/g) || []).length;
      if (opens <= closes) break;
      j++;
    }
    out.push({ indent: line.indent, text: buf });
    i = j;
  }
  return out;
}

function convert(lines, ctx) {
  const out = [];
  const stack = [];
  let foundEntry = false;

  lines.forEach((line, idx) => {
    const no = idx + 1;
    let text = line.text.trim();
    if (!text) return;
    const indent = line.indent;
    const pad = '  '.repeat(Math.floor(indent / 2));

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

    if (/^package\s+\w+/.test(text)) return;
    if (/^import\s*\(/.test(text) || /^import\s+"/.test(text)) return;

    const funcM = /^func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{\s*$/.exec(text);
    if (funcM) {
      let name = funcM[1];
      const params = funcM[2].trim();
      const renamed = name.startsWith('user_run_application')
        ? (ctx.appId ? entryName(ctx.appId) : name)
        : name;
      if (name.startsWith('user_run_application')) foundEntry = true;
      out.push(pad + `function ${renamed}(${goParams(params)}) {`);
      stack.push({ indent, kind: 'func' });
      return;
    }

    const ifM = /^if\s+([\s\S]+?)\s*\{\s*$/.exec(text);
    if (ifM) {
      const cond = ifM[1].replace(/;\s*err\s*:=\s*.+$/, '').trim();
      out.push(`${pad}if (${expr(cond, no)}) {`);
      stack.push({ indent, kind: 'if' });
      return;
    }

    if (/^else\s+if\s+([\s\S]+?)\s*\{\s*$/.test(text)) {
      const cond = /^else\s+if\s+([\s\S]+?)\s*\{\s*$/.exec(text)[1];
      out.push(`${pad}} else if (${expr(cond, no)}) {`);
      return;
    }
    if (/^else\s*\{\s*$/.test(text)) {
      out.push(`${pad}} else {`);
      return;
    }

    const retM = /^return\s*([\s\S]*)$/.exec(text);
    if (retM) {
      const v = retM[1].trim();
      out.push(pad + `return${v ? ' ' + expr(v, no) : ''};`);
      return;
    }

    const defineM = /^([A-Za-z_]\w*)\s*:=\s*([\s\S]+)$/.exec(text);
    if (defineM) {
      out.push(`${pad}const ${defineM[1]} = ${expr(defineM[2], no)};`);
      return;
    }

    const varM = /^var\s+([A-Za-z_]\w*)\s*(?:[\w\.\[\]\*]+)?\s*=\s*([\s\S]+)$/.exec(text);
    if (varM) {
      out.push(`${pad}const ${varM[1]} = ${expr(varM[2], no)};`);
      return;
    }

    if (/^[A-Za-z_][\w.]*\s*\(/.test(text)) {
      out.push(pad + expr(text, no) + ';');
      return;
    }

    throw new ParseError(
      'go',
      `Не поддерживается конструкция: ${text.slice(0, 60)}`,
      'Поддерживаются: func, :=, var, if/else, return, map/slice-литералы, fmt.Print*.',
      no
    );
  });

  while (stack.length) {
    out.push('  '.repeat(Math.floor(stack.pop().indent / 2)) + '}');
  }

  if (!foundEntry) {
    throw new ParseError(
      'go',
      'Не найдена функция user_run_application_<id>().',
      'В шаблоне должна быть ровно одна функция точка входа.',
      1
    );
  }

  return { code: out.filter(Boolean).join('\n') + '\n', entryName: ctx.appId || null };
}

/** Go-параметры "a string, b int" -> "a, b". */
function goParams(params) {
  if (!params.trim()) return '';
  return params
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const parts = p.split(/\s+/);
      const name = parts[0].replace(/^\w+\./, '');
      const isVariadic = /^(\w+)\s+\.\.\./.test(p);
      return isVariadic ? '...' + name : name;
    })
    .join(', ');
}

function expr(src, lineNo) {
  let s = src.trim().replace(/\s*$/, '');

  // Конкатенация строк: "a" + x + "b" -> 'a' + x + 'b'
  const parts = splitTop(s, '+');
  if (parts.length > 1) {
    return parts.map((p) => expr(p.trim(), lineNo)).join(' + ');
  }

  // fmt.Sprintf -> шаблонный литерал
  const sprintf = /^fmt\.Sprintf\(([\s\S]*)\)$/.exec(s);
  if (sprintf) {
    const args = splitTop(sprintf[1]);
    const fmtStr = args[0].trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^`([\s\S]*)`$/, '$1');
    const rest = args.slice(1).map((a) => expr(a.trim(), lineNo));
    return jsTemplate(fmtStr.replace(/%[sdvq]/g, '${__a}'), 'go').replace(
      /\$\{__a\}/g,
      () => '${' + (rest.shift() ?? "''") + '}'
    ).replace(/\$\{__fmt\}/g, '__fmt__');
  }

  // map[string]interface{}{"k": v}
  const mapM = /^map\[string\](?:interface\{\}|any)\{([\s\S]*)\}$/.exec(s);
  if (mapM) {
    const inner = mapM[1].trim();
    if (!inner) return '{}';
    return '{ ' + splitTop(inner).map((p) => toPair(p.trim(), lineNo)).join(', ') + ' }';
  }

  const mapAny = /^map\[[\w\.]+\](?:interface\{\}|any)\{([\s\S]*)\}$/.exec(s);
  if (mapAny) {
    const inner = mapAny[1].trim();
    if (!inner) return '{}';
    return '{ ' + splitTop(inner).map((p) => toPair(p.trim(), lineNo)).join(', ') + ' }';
  }

  // []string{...}
  const sliceM = /^\[\][\w\.\*]+\{([\s\S]*)\}$/.exec(s);
  if (sliceM) {
    const inner = sliceM[1].trim();
    if (!inner) return '[]';
    return '[' + splitTop(inner).map((v) => expr(v.trim(), lineNo)).join(', ') + ']';
  }

  // []byte("текст")
  const bytesM = /^\[\]byte\("([\s\S]*)"\)$/.exec(s);
  if (bytesM) return jsString(bytesM[1]);

  // интерполированный литерал `...`
  const backtick = /^`([\s\S]*)`$/.exec(s);
  if (backtick) return jsTemplate(backtick[1], 'go');

  if (/^"([\s\S]*)"$/.test(s)) return jsString(s.slice(1, -1));

  return convertFragment(s, lineNo);
}

function toPair(pair, lineNo) {
  const idx = pair.indexOf(':');
  if (idx === -1) {
    throw new ParseError('go', `Ожидалась пара "ключ": значение, получено: ${pair}`, '', lineNo);
  }
  const rawKey = pair.slice(0, idx).trim().replace(/^"([\s\S]*)"$/, '$1');
  const key = /^[A-Za-z_$][\w$]*$/.test(rawKey) ? rawKey : jsString(rawKey);
  return `${key}: ${expr(pair.slice(idx + 1).trim(), lineNo)}`;
}

function convertFragment(s, lineNo) {
  let out = s;
  Object.keys(GO_BUILTINS).forEach((k) => {
    const re = new RegExp(`(^|[^\\w.$])${k.replace('.', '\\.')}(?![\\w])`, 'g');
    out = out.replace(re, (m, p1) => p1 + GO_BUILTINS[k]);
  });
  if (/\w+\s*:=\s*!/.test(out)) {
    throw new ParseError('go', 'Многозначные присваивания (x, err := ...) не поддерживаются.', '', lineNo);
  }
  out = out.replace(/==/g, '===').replace(/!=/g, '!==');
  out = out.replace(/\+\+\s*$/, ' += 1');
  return out;
}

/**
 * Разбиение по символу верхнего уровня (скобки и строки учитываются).
 * sep передаётся строкой из одного символа; можно передать ',' или '+'.
 */
function splitTop(s, sep = ',') {
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
    if (ch === '"' || ch === '`' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (depth === 0 && ch === sep) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}