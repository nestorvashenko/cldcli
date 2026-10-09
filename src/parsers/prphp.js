/**
 * PHP -> JavaScript (подмножество).
 *
 * Поддерживается:
 *   <?php ... ?>                  -> отбрасываются теги
 *   function name($a, $b) { }     -> function name(a, b) { }
 *   $x = "строка $var {$a[0]}"    -> const x = `строка ${var} ${a[0]}`
 *   echo "..."                    -> console.log(`...`)
 *   ['k' => v] / array(k => v)    -> { k: v }
 *   if ($x) { } else { }          -> if (x) { } else { }
 *   foreach ($a as $v) { }        -> for (const v of a) { }
 *   return                        -> return;
 *   Window_add(...)               -> Window_add(...)
 *
 * Не поддерживается: классы, интерфейсы, трейты, namespace, генераторы,
 * замыкания (function() use), match, enum, атрибуты.
 */

import { ParseError } from '../core/errors.js';
import { scan, joinContinuations } from './shared/scanner.js';
import { jsTemplate, jsString } from './shared/emit.js';
import { entryName } from './shared/entry.js';

export const id = 'php';

const PHP_BUILTINS = {
  'echo': 'console.log',
  'print_r': 'console.log',
  'var_dump': 'console.log',
  'true': 'true',
  'false': 'false',
  'null': 'null',
  'count': 'a => a.length',
  'strval': 'String',
  'intval': 'parseInt'
};

export async function validate(source, ctx = {}) {
  return parse(source, ctx).entryName;
}

export function parse(source, ctx = {}) {
  const stripped = source.replace(/<\?php|<\?=/g, '').replace(/\?>/g, '');
  const lines = joinContinuations(
    scan(stripped, {
      lineComment: '//',
      hashComment: true,
      blockComment: true,
      heredoc: true
    })
  );
  return convert(lines, ctx);
}

function convert(lines, ctx) {
  const out = [];
  const stack = [];
  let foundEntry = false;

  lines.forEach((line, idx) => {
    const no = idx + 1;
    let text = line.text.trim().replace(/;\s*$/, '');
    if (!text) return;
    const indent = line.indent;
    const pad = '  '.repeat(Math.floor(indent / 2));

    // Явная закрывающая скобка закрывает ровно один блок
    if (text.startsWith('}')) {
      const closed = stack.pop();
      out.push(closed ? '  '.repeat(Math.floor(closed.indent / 2)) + '}' : '}');
      text = text.slice(1).trim().replace(/;\s*$/, '');
      if (!text) return;
    }

    while (stack.length && indent <= stack[stack.length - 1].indent) {
      out.push('  '.repeat(Math.floor(stack.pop().indent / 2)) + '}');
    }

    if (/^(declare|namespace|use)\s/.test(text)) return;

    const funcM = /^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{\s*$/.exec(text);
    if (funcM) {
      const name = funcM[1];
      const params = funcM[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.replace(/^\$/, '').split('=')[0].trim())
        .join(', ');
      const renamed = name.startsWith('user_run_application')
        ? (ctx.appId ? entryName(ctx.appId) : name)
        : name;
      if (name.startsWith('user_run_application')) foundEntry = true;
      out.push(pad + `function ${renamed}(${params}) {`);
      stack.push({ indent, kind: 'func' });
      return;
    }

    const ifM = /^if\s*\(([\s\S]+?)\)\s*\{\s*$/.exec(text);
    if (ifM) {
      out.push(`${pad}if (${expr(ifM[1], no)}) {`);
      stack.push({ indent, kind: 'if' });
      return;
    }
    if (/^else\s*if\s*\(([\s\S]+?)\)\s*\{\s*$/.test(text)) {
      const cond = /^else\s*if\s*\(([\s\S]+?)\)\s*\{\s*$/.exec(text)[1];
      out.push(`${pad}} else if (${expr(cond, no)}) {`);
      return;
    }
    if (/^else\s*(\{\s*)?$/.test(text)) {
      out.push(`${pad}} else {`);
      return;
    }

    const forM = /^foreach\s*\((.+?)\s+as\s+([^)]+?)\)\s*\{\s*$/.exec(text);
    if (forM) {
      const coll = expr(forM[1].trim(), no);
      let item = forM[2].trim();
      let idxVar = null;
      if (/^\$(\w+)\s*=>\s*\$(\w+)$/.test(item)) {
        const m = /^(\$\w+)\s*=>\s*(\$\w+)$/.exec(item);
        idxVar = m[1].replace('$', '');
        item = m[2].replace('$', '');
      }
      const name = item.replace(/^\$/, '').split('=>')[0].trim();
      if (idxVar) {
        out.push(`${pad}for (const [${idxVar}, ${name}] of Object.entries(${coll})) {`);
      } else {
        out.push(`${pad}for (const ${name} of ${coll}) {`);
      }
      stack.push({ indent, kind: 'for' });
      return;
    }

    if (/^for\s*\(/.test(text)) {
      throw new ParseError(
        'php',
        'Цикл for ($i = 0; ...) не поддерживается.',
        'Используйте foreach или перепишите на обычный перебор.',
        no
      );
    }

    const retM = /^return\b\s*([\s\S]*)$/.exec(text);
    if (retM) {
      const v = retM[1].trim();
      out.push(pad + `return${v ? ' ' + expr(v, no) : ''};`);
      return;
    }

    const assignM = /^(\$\w+)\s*=\s*([\s\S]+)$/.exec(text);
    if (assignM) {
      out.push(`${pad}const ${assignM[1].replace('$', '')} = ${expr(assignM[2], no)};`);
      return;
    }

    if (/^(echo|print)\b/.test(text)) {
      const arg = text.replace(/^(echo|print)\b/, '').trim();
      out.push(pad + `console.log(${expr(arg, no)});`);
      return;
    }

    if (/^\$[\w\[\]'"]+\s*\(/.test(text) || /^[A-Za-z_]\w*\s*\(/.test(text)) {
      out.push(pad + expr(text, no) + ';');
      return;
    }

    throw new ParseError(
      'php',
      `Не поддерживается конструкция: ${text.slice(0, 60)}`,
      'Поддерживаются: function, присваивание, echo, if/elseif/else, foreach, return, вызовы функций.',
      no
    );
  });

  while (stack.length) {
    out.push('  '.repeat(Math.floor(stack.pop().indent / 2)) + '}');
  }

  if (!foundEntry) {
    throw new ParseError(
      'php',
      'Не найдена функция user_run_application_<id>().',
      'В шаблоне должна быть ровно одна функция точка входа.',
      1
    );
  }

  return { code: out.filter(Boolean).join('\n') + '\n', entryName: ctx.appId || null };
}

function expr(src, lineNo) {
  let s = src.trim();

  // конкатенация строк через .
  if (/\s\.\s/.test(s) && !/=>/.test(s)) {
    const parts = s.split(/\s\.\s/).map((p) => expr(p.trim(), lineNo));
    return parts.join(' + ');
  }

  // Ассоциативный массив в квадратных скобках -> объект.
  // Проверяем ДО обычного массива: ['k' => v] это объект, а не список.
  const shortMap = /^\[([\s\S]*)\]$/.exec(s);
  if (shortMap && /=>/.test(shortMap[1])) {
    const inner = shortMap[1].trim();
    if (!inner) return '{}';
    return '{ ' + splitTop(inner).map((v) => toPair(v.trim(), lineNo)).join(', ') + ' }';
  }

  // массив
  const shortArr = /^\[([\s\S]*)\]$/.exec(s);
  if (shortArr) {
    const inner = shortArr[1].trim();
    if (!inner) return '[]';
    return '[' + splitTop(inner).map((v) => expr(v.trim(), lineNo)).join(', ') + ']';
  }

  const arrayCall = /^(?:array|list)\s*\(([\s\S]*)\)$/.exec(s);
  if (arrayCall) {
    const inner = arrayCall[1].trim();
    if (!inner) return '[]';
    return '{ ' + splitTop(inner).map((v) => toPair(v.trim(), lineNo)).join(', ') + ' }';
  }

  if (/\$[\w.]*\s*=>\s*/.test(s)) {
    return '{ ' + splitTop(s).map((v) => toPair(v.trim(), lineNo)).join(', ') + ' }';
  }

  // heredoc <<<HTML ... HTML;
  const heredoc = /^<<<\s*(?:['"])?[A-Za-z_]\w*(?:['"])?\r?\n([\s\S]*?)\r?\n?\s*[A-Za-z_]\w*\s*;?$/.exec(s);
  if (heredoc) return jsTemplate(heredoc[1], 'php');

  // интерполированная строка
  const tpl = /^"([\s\S]*)"$/.exec(s);
  if (tpl && /\$/.test(tpl[1])) {
    return jsTemplate(tpl[1], 'php');
  }
  if (tpl) return jsString(tpl[1]);

  if (/^'([\s\S]*)'$/.test(s)) return jsString(s.slice(1, -1));

  return convertFragment(s, lineNo);
}

function toPair(pair, lineNo) {
  const m = /^(\$[^\s=]+|['"][^'"]*['"])\s*=>\s*([\s\S]+)$/.exec(pair);
  if (!m) {
    throw new ParseError('php', `Ожидалась пара ключ => значение: ${pair}`, '', lineNo);
  }
  let key = m[1];
  if (key.startsWith('$')) {
    key = `[${key.replace('$', '')}]`;
  } else {
    const raw = key.replace(/^['"]|['"]$/g, '');
    key = /^[A-Za-z_$][\w$]*$/.test(raw) ? raw : jsString(raw);
  }
  return `${key}: ${expr(m[2].trim(), lineNo)}`;
}

function convertFragment(s, lineNo) {
  let out = s;
  // переменные $foo -> foo, но $foo['bar'] -> foo['bar']
  out = out.replace(/\$(\w+)/g, '$1');
  Object.keys(PHP_BUILTINS).forEach((k) => {
    out = out.replace(new RegExp(`(^|[^\\w.$])${k}(?![\\w])`, 'g'), (m, p1) => p1 + PHP_BUILTINS[k]);
  });
  out = out.replace(/==/g, '===').replace(/!=/g, '!==');
  if (/\bfn\s*\(/.test(out)) {
    throw new ParseError('php', 'Стрелочные функции fn() не поддерживаются.', '', lineNo);
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