/**
 * Python -> JavaScript (подмножество).
 *
 * ColdOS не имеет Python-рантайма, поэтому поддерживается только подмножество,
 * достаточное для приложения ColdOS. Всё остальное — явная ошибка, а не
 * молчаливый мусор на выходе.
 *
 * Поддерживается:
 *   def name(args): ...            -> function name(args) { ... }
 *   x = <expr> / x: T = <expr>    -> const x = <expr>;
 *   True/False/None                -> true/false/null
 *   f"...{x}..."                  -> `...${x}...`
 *   {...} словарь                  -> { ... } объект
 *   if cond: / return              -> if (cond) { return ... }
 *   print(...)                     -> console.log(...)
 *   Window_add(...) и прочие       -> прямой вызов
 *
 * Не поддерживается (ошибка): классы, циклы for/while, try, yield,
 * декораторы, async, генераторы, list comprehensions, *args/**kwargs.
 */

import { ParseError } from '../core/errors.js';
import { scan, joinContinuations, isStringLiteral } from './shared/scanner.js';
import { jsTemplate, jsString } from './shared/emit.js';
import { entryName } from './shared/entry.js';

export const id = 'python';

const PY_BUILTINS = {
  True: 'true',
  False: 'false',
  None: 'null',
  print: 'console.log',
  str: 'String',
  int: 'parseInt',
  float: 'parseFloat',
  bool: 'Boolean',
  len: 'a => a.length'
};

const KEYWORDS_BLOCK = ['if', 'elif', 'else'];

export async function validate(source, ctx = {}) {
  return parse(source, ctx).entryName;
}

export function parse(source, ctx = {}) {
  // В Python отступы задают блоки, поэтому фигурные скобки встречаются
  // только в литералах (словари, f-строки) — их безопасно склеивать.
  const lines = joinContinuations(
    scan(source, { hashComment: true, tripleQuotes: true }),
    { braces: true }
  );
  return convert(lines, ctx);
}

function convert(lines, ctx) {
  const out = [];
  const blocks = []; // стек открытых блоков: 'func' | 'if'
  let foundEntry = false;
  let currentFunc = null;

  lines.forEach((line, idx) => {
    const no = idx + 1;
    const text = line.text.replace(/\s+$/, '');
    if (!text.trim()) return;

    const indent = line.indent;

    // Закрываем блоки, пока отступ не станет строго больше открытого
    while (blocks.length && indent <= blocks[blocks.length - 1].indent) {
      const b = blocks.pop();
      out.push(indentOf(b.indent) + '}');
    }

    // Тело блока живёт на одном отступе: фиксируем его при первой строке тела
    const top = blocks[blocks.length - 1];
    if (top) {
      if (indent > top.indent) {
        if (top.bodyIndent === null) {
          top.bodyIndent = indent;
        } else if (indent !== top.bodyIndent) {
          throw new ParseError(
            'python',
            'Несовпадающие отступы внутри блока.',
            'Поддерживаются только def, if/elif/else с однозначными отступами.',
            no
          );
        }
      } else if (top.bodyIndent !== null && indent <= top.indent) {
        top.bodyIndent = null;
      }
    }

    // Явно отвергаем неподдерживаемые конструкции: иначе они распознаются
    // как «кривые отступы», и диагностика сбивает с толку.
    const unsupported = matchUnsupported(text);
    if (unsupported) {
      throw new ParseError('python', unsupported.message, unsupported.hint, no);
    }

    const m = matchStatement(text);

    // Докстринг: одиночный строковый литерал как отдельное выражение.
    // В JS такой конструкции нет, поэтому просто отбрасываем.
    if (m.kind === 'expr' && isStringLiteral(text.trim())) {
      return;
    }

    if (m.kind === 'def') {
      if (foundEntry && !blocks.length && currentFunc !== m.name) {
        throw new ParseError(
          'python',
          `В файле больше одной функции: ${m.name}.`,
          'Приложение ColdOS должно содержать одну функцию user_run_application_<id>.',
          no
        );
      }
      currentFunc = m.name;
      const renamed = renameEntry(m.name, ctx);
      if (renamed) foundEntry = true;
      out.push(`${indentOf(indent)}function ${renamed}(${m.params}) {`);
      blocks.push({ indent, kind: 'func', name: m.name, bodyIndent: null });
      return;
    }

    if (KEYWORDS_BLOCK.includes(m.kind)) {
      // elif/else продолжают предыдущий if: закрываем его и открываем новый
      if (m.kind === 'elif' || m.kind === 'else') {
        const prev = blocks.pop();
        if (prev) out.push(indentOf(prev.indent) + '}');
      }
      const head = m.kind === 'else' ? 'else {' : `if (${m.value ? expr(m.value, no) : 'true'}) {`;
      out.push(indentOf(indent) + head);
      blocks.push({ indent, kind: m.kind, bodyIndent: null });
      return;
    }

    if (m.kind === 'return') {
      const value = m.value ? expr(m.value, no) : '';
      out.push(indentOf(indent) + `return${value ? ' ' + value : ''};`);
      return;
    }

    if (m.kind === 'assign') {
      out.push(`${indentOf(indent)}const ${m.name} = ${expr(m.value, no)};`);
      return;
    }

    if (m.kind === 'call') {
      out.push(indentOf(indent) + expr(text, no) + ';');
      return;
    }

    if (m.kind === 'expr') {
      out.push(indentOf(indent) + expr(text, no) + ';');
      return;
    }

    throw new ParseError(
      'python',
      `Не поддерживается конструкция: ${text.trim().slice(0, 60)}`,
      'Поддерживаются: def, if/elif/else, return, присваивание, вызов функции. ' +
        'Классы, циклы, try, async и декораторы не поддерживаются.',
      no
    );
  });

  while (blocks.length) {
    const b = blocks.pop();
    out.push(indentOf(b.indent) + '}');
  }

  if (!foundEntry) {
    throw new ParseError(
      'python',
      'Не найдена функция user_run_application_<id>().',
      'В шаблоне должна быть ровно одна функция точка входа.',
      1
    );
  }

  return { code: out.filter(Boolean).join('\n') + '\n', entryName: ctx.appId || null };
}

/** Конструкции Python вне поддерживаемого подмножества. */
const UNSUPPORTED = [
  [/^\s*for\s+/, 'Цикл for не поддерживается', 'Перепишите цикл на повторяющиеся вызовы или напишите приложение на JS.'],
  [/^\s*while\s+/, 'Цикл while не поддерживается', 'Перепишите цикл на повторяющиеся вызовы или напишите приложение на JS.'],
  [/^\s*try\s*[:]/, 'try/except не поддерживается', 'Ошибки обрабатывайте проверкой значения (например, if x is None).'],
  [/^\s*(except|finally)\b/, 'try/except не поддерживается', 'Ошибки обрабатывайте проверкой значения.'],
  [/^\s*with\s+/, 'with не поддерживается', 'Откройте ресурс напрямую и закройте вручную.'],
  [/^\s*class\s+/, 'Классы не поддерживаются', 'Используйте простые функции и словари.'],
  [/^\s*async\s+def\b/, 'async/await не поддерживаются', 'ColdOS выполняет JS: используйте promise-цепочки в JS-шаблоне.'],
  [/^\s*await\s+/, 'async/await не поддерживаются', 'ColdOS выполняет JS: используйте promise-цепочки в JS-шаблоне.'],
  [/^\s*@/, 'Декораторы не поддерживаются', 'Вызовите декорируемую функцию напрямую.'],
  [/^\s*yield\b/, 'Генераторы не поддерживаются', 'Верните готовый список из функции.'],
  [/\bfor\s+\w+\s+in\b/, 'Comprehension не поддерживается', 'Постройте список обычным циклом в JS-шаблоне.']
];

function matchUnsupported(text) {
  for (const [re, message, hint] of UNSUPPORTED) {
    if (re.test(text)) return { message, hint };
  }
  return null;
}

const indentOf = (n) => '  '.repeat(Math.floor(n / 2));

function renameEntry(name, ctx) {
  if (name.startsWith('user_run_application')) {
    return ctx.appId ? entryName(ctx.appId) : name;
  }
  return name;
}

/** Разбор строки на один из поддерживаемых видов. */
function matchStatement(text) {
  const t = text.trim();

  const def = /^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:\s*$/.exec(t);
  if (def) return { kind: 'def', name: def[1], params: def[2].trim() };

  const ifM = /^if\s+([\s\S]+):\s*$/.exec(t);
  if (ifM) return { kind: 'if', value: ifM[1].trim() };

  if (/^elif\s+[\s\S]+:\s*$/.test(t)) {
    return { kind: 'elif', value: t.replace(/^elif\s+/, '').replace(/:\s*$/, '') };
  }
  if (/^else\s*:\s*$/.test(t)) return { kind: 'else', value: '' };

  const ret = /^return\b\s*([\s\S]*)$/.exec(t);
  if (ret) return { kind: 'return', value: ret[1].trim() };

  const ann = /^([A-Za-z_]\w*)\s*:\s*[\w\[\]\., ]+?\s*=\s*([\s\S]+)$/.exec(t);
  if (ann) return { kind: 'assign', name: ann[1], value: ann[2].trim() };

  const asg = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(t);
  if (asg) return { kind: 'assign', name: asg[1], value: asg[2].trim() };

  if (/^[A-Za-z_]\w*\s*\(/.test(t)) return { kind: 'call' };

  return { kind: 'expr' };
}

/** Выражение Python -> JS. */
function expr(src, lineNo) {
  let s = src.trim();

  // многострочный литерал """...""" или '''...'''
  // Проверяем первым: префикс f перед тройной кавычкой не склеивается
  const triple = /^([fF]?)(['"])\2\2([\s\S]*)\2\2\2$/.exec(s);
  if (triple) return jsTemplate(triple[3], 'python');

  // f-строка
  const fstr = /^[fF](['"])([\s\S]*)\1$/.exec(s);
  if (fstr) return jsTemplate(fstr[2], 'python');

  // словарь {...} -> объект
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return '{}';
    return (
      '{ ' +
      fragments(inner, ',').map((pair) => dictPair(pair.trim(), lineNo)).join(', ') +
      ' }'
    );
  }

  // список/кортеж -> массив
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('(') && s.endsWith(')'))) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return '[]';
    return '[' + fragments(inner, ',').map((v) => expr(v, lineNo)).join(', ') + ']';
  }

  // обычная строка
  if (/^(['"])([\s\S]*)\1$/.test(s)) {
    return jsString(s.slice(1, -1));
  }

  // арифметика и вызовы: токенная замена литералов
  return replaceTokens(s, lineNo);
}

function dictPair(pair, lineNo) {
  const idx = pair.indexOf(':');
  if (idx === -1) {
    throw new ParseError('python', `Ожидался словарь вида "ключ": значение, получено: ${pair}`, '', lineNo);
  }
  const key = pair.slice(0, idx).trim().replace(/^(['"])(.*)\1$/, '$2');
  const value = pair.slice(idx + 1).trim();
  const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : jsString(key);
  return `${safeKey}: ${expr(value, lineNo)}`;
}

/** Замена Python-литералов и встроенных функций в произвольном выражении. */
function replaceTokens(s, lineNo) {
  return fragments(s, ',').map((part) => convertFragment(part, lineNo)).join(', ');
}

/** Аргументы верхнего уровня, разделённые sep, без самих разделителей. */
function fragments(s, sep) {
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
    if (ch === '"' || ch === "'" || ch === '`') {
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
  out.push(buf);
  return out;
}

/** Конвертация одного фрагмента (между разделителями верхнего уровня). */
function convertFragment(t, lineNo) {
  let s = t;

  // встроенные имена
  Object.keys(PY_BUILTINS).forEach((k) => {
    const re = new RegExp(`(^|[^\\w.$])${k}(?![\\w(])`, 'g');
    s = s.replace(re, (m, p1) => p1 + PY_BUILTINS[k]);
  });

  // f-строка в середине выражения (конкатенация)
  const fstr = /(['"])([\s\S]*?)\1/;
  const quoted = fstr.exec(s);
  if (quoted && /^f/i.test(s.trimStart()[0] === 'f' ? 'x' : 'y')) {
    return jsTemplate(quoted[2], 'python');
  }

  // f-строки внутри склеенного выражения
  s = s.replace(/f(['"])([\s\S]*?)\1/g, (m, q, body) => {
    const tpl = jsTemplate(body, 'python').slice(1, -1);
    return '`' + tpl + '`';
  });

  // строковые литералы
  s = s.replace(/(['"])([\\'"]*?)\1/g, (m, q, body) => jsString(body));

  // арифметика совпадает, отличается только логика
  s = s.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
  s = s.replace(/==/g, '===').replace(/!=/g, '!==');

  // атрибуты через точку уже валидны для JS
  // ключевые слова-исключения не трогаем
  s = s.replace(/f([`"'])/g, '$1');

  return s;
}

/**
 * Разбиение по разделителю верхнего уровня (скобки и строки учитываются).
 * Если sep === null — просто сегменты чётной/нечётной позиции для replace.
 */