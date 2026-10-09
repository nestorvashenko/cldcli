/**
 * Мини-сканер исходника.
 *
 * Задача: безопасно отличать код от строковых литералов и комментариев.
 * Без этого regex-правила в парсерах ломаются на любом тексте вида
 * "100% // ok" или f-строках с фигурными скобками.
 *
 * Результат — массив логических строк: { indent, text }.
 * Многострочные литералы (''' """ ``) остаются одним элементом,
 * чтобы парсер видел целую строку, а не её огрызки.
 */

export function scan(source, opts = {}) {
  const {
    lineComment = '//',
    hashComment = false,
    blockComment = false,
    tripleQuotes = false,
    backtick = false,
    heredoc = false
  } = opts;

  const lines = [];
  let indent = 0;
  let inBlockComment = false;
  let text = '';
  let quote = null; // активный многострочный литерал
  let multi = false; // текущая накопленная строка многострочная
  let i = 0;

  const push = () => {
    const trimmed = text.trim();
    if (trimmed !== '') lines.push({ indent, text: trimmed });
    else if (lines.length && text.includes('\n')) lines.push({ indent, text: '' });
    text = '';
    indent = 0;
    multi = false;
  };

  const addChar = (ch) => {
    text += ch;
  };

  while (i < source.length) {
    const ch = source[i];

    // --- внутри многострочного литерала ---
    if (quote) {
      if (ch === '\\' && quote !== '`') {
        addChar(ch);
        addChar(source[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (tripleQuotes && source.slice(i, i + 3) === quote.repeat(3)) {
          addChar(quote.repeat(3));
          i += 3;
          quote = null;
          push();
          continue;
        }
        if (!tripleQuotes) {
          addChar(ch);
          i += 1;
          quote = null;
          if (ch === '\n') push();
          continue;
        }
      }
      addChar(ch);
      i += 1;
      continue;
    }

    // --- новая строка ---
    if (ch === '\n') {
      if (multi) {
        // многострочный литерал продолжается: сохраняем перенос
        addChar(ch);
        i += 1;
        continue;
      }
      push();
      i += 1;
      continue;
    }

    // --- пробелы / табы (считаем отступ) ---
    if (ch === ' ' || ch === '\t') {
      if (text.trim() === '') indent += ch === '\t' ? 4 : 1;
      addChar(ch);
      i += 1;
      continue;
    }

    // --- PHP heredoc: <<<HTML ... HTML; ---
    if (heredoc && source.startsWith('<<<', i)) {
      const m = /^<<<\s*(['"]?)([A-Za-z_]\w*)\1\r?\n/.exec(source.slice(i));
      if (m) {
        const label = m[2];
        addChar(source.slice(i, i + m[0].length));
        i += m[0].length;
        const closeRe = new RegExp(`^[ \\t]*${label}\\b`, 'm');
        const rest = source.slice(i);
        const cm = closeRe.exec(rest);
        const end = cm ? i + cm.index + cm[0].length : source.length;
        addChar(source.slice(i, end));
        i = end;
        // heredoc закрыт: сбрасываем multi, иначе следующие переносы
        // строк тоже будут поглощены
        multi = false;
        push();
        continue;
      }
    }

    // --- блочные комментарии ---
    if (inBlockComment) {
      if (source.slice(i, i + 2) === '*/') {
        i += 2;
        inBlockComment = false;
        continue;
      }
      if (ch === '\n') {
        multi = true;
        addChar(ch);
      }
      i += 1;
      continue;
    }
    if (blockComment && source.slice(i, i + 2) === '/*') {
      i += 2;
      inBlockComment = true;
      continue;
    }

    // --- однострочные комментарии ---
    if (lineComment && source.startsWith(lineComment, i)) {
      // `//` считается комментарием всегда, `#` — только в начале строки
      if (lineComment === '//' || text.trim() === '') {
        while (i < source.length && source[i] !== '\n') i += 1;
        continue;
      }
    }
    if (hashComment && ch === '#' && text.trim() === '') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    // --- начало строкового литерала ---
    if (ch === '"' || ch === "'") {
      if (tripleQuotes && source.slice(i, i + 3) === ch.repeat(3)) {
        addChar(ch.repeat(3));
        i += 3;
        quote = ch;
        multi = true;
        continue;
      }
      addChar(ch);
      i += 1;
      // ищем закрытие на этой же строке
      let j = i;
      let closed = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          closed = true;
          break;
        }
        j += 1;
      }
      if (closed) {
        addChar(source.slice(i, j + 1));
        i = j + 1;
      } else {
        // Незакрытая кавычка: в C-подобных языках и PHP такая строка
        // недопустима. Оставляем как есть — ошибку сообщит парсер,
        // молча проглатывать хвост файла нельзя.
        i = j;
      }
      continue;
    }

    if (backtick && ch === '`') {
      let j = source.indexOf('`', i + 1);
      j = j === -1 ? source.length : j + 1;
      addChar(source.slice(i, j));
      i = j;
      continue;
    }

    addChar(ch);
    i += 1;
  }

  if (text.trim() !== '') push();

  return lines;
}

/**
 * Склеивает многострочные выражения: пока скобки не сбалансированы,
 * строки объединяются в одну логическую строку.
 * Нужно для mapOf(...), fmt.Sprintf(...) и подобных многострочных вызовов.
 *
 * Фигурные скобки по умолчанию НЕ учитываются: в C-подобных языках они
 * открывают блок, и склейка схлопнула бы всё тело функции в одну строку.
 * Включаются через opts.braces для языков с многострочными литералами (Go).
 */
export function joinContinuations(lines, opts = {}) {
  const { braces = false } = opts;
  const open = braces ? '([{' : '([';
  const close = braces ? ')]}' : ')]';
  const out = [];
  let buf = null;
  let depth = 0;

  const balance = (text) => {
    let d = 0;
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        // тройные кавычки: закрываем пачкой, содержимое игнорируем
        if (text.startsWith(quote.repeat(3), i)) {
          i += 2;
          quote = null;
          continue;
        }
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (text.startsWith('"""', i) || text.startsWith("'''", i)) {
        quote = ch;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (open.includes(ch)) d++;
      if (close.includes(ch)) d--;
    }
    return d;
  };

  lines.forEach((line) => {
    if (buf === null) {
      const d = balance(line.text);
      if (d > 0) {
        buf = { indent: line.indent, text: line.text };
        depth = d;
      } else {
        out.push(line);
      }
      return;
    }
    buf.text += ' ' + line.text.trim();
    depth += balance(line.text);
    if (depth <= 0) {
      out.push(buf);
      buf = null;
    }
  });

  if (buf !== null) out.push(buf);
  return out;
}

/** Снимает кавычки со строкового литерала. */
export function unquote(raw) {
  let s = raw.trim();
  const q = s[0];
  if ((q === '"' || q === "'" || q === '`') && s.length > 1) {
    if (s.startsWith(q.repeat(3))) return s.slice(3, -3);
    if (s.endsWith(q)) return s.slice(1, -1);
  }
  return s;
}

export const isStringLiteral = (text) => {
  const t = text.trim();
  if (t.length < 2) return false;
  const q = t[0];
  if (q !== '"' && q !== "'" && q !== '`') return false;
  if (t.startsWith(q.repeat(3))) return t.endsWith(q.repeat(3));
  return t.endsWith(q);
};