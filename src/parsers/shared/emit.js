/**
 * Общие помощники генерации JS для всех парсеров.
 *
 * Парсеры не строят абстрактное дерево: ColdOS-приложение — это плоский
 * набор присваиваний и вызовов глобальных функций ColdOS. Поэтому достаточно
 * преобразовать значения и объединить строки.
 */

/** JS-строка с экранированием. */
export function jsString(value) {
  return JSON.stringify(String(value));
}

/**
 * Строковый литерал с интерполяцией -> шаблонный литерал JS.
 * Переменные вида {id} / $id / ${id} / %s превращаются в ${id}.
 */
export function jsTemplate(raw, language) {
  let body = raw;

  switch (language) {
    case 'python':
      // f"...{x}..." -> `${x}`
      // {{...}} — экранированные скобки Python, оставляем как есть:
      // иначе плейсхолдер {{COMPILER_VER}} будет разобран как интерполяция.
      body = body.replace(/(?<!\{)\{([A-Za-z_$][\w$]*)\}(?!\})/g, '${$1}');
      break;
    case 'php':
      // PHP: "$name" и "${name}", а также {$name}
      body = body
        .replace(/\$([A-Za-z_]\w*)/g, '${$1}')
        .replace(/\{(\$[^}]+)\}/g, '${$1}');
      break;
    case 'go':
      // Go: %s, %d, %v -> без аргументов оставляем как есть (конвертирует вызывающий)
      body = body.replace(/%[sdvq]/g, '${__fmt}');
      break;
    case 'kotlin':
      // Kotlin: "$name" и "${expr}"
      body = body.replace(/\$\{([^}]+)\}/g, '${$1}').replace(/\$([A-Za-z_]\w*)/g, '${$1}');
      break;
    default:
      break;
  }

  return '`' + body.replace(/`/g, '\\`').replace(/\$\{__fmt\}/g, '__fmt__') + '`';
}

/** Список аргументов вызова -> строка аргументов JS. */
export function jsArgs(args) {
  return args.map((a) => a.trim()).filter(Boolean).join(', ');
}

/** Первый символ в нижний регистр (для имён переменных). */
export const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Собрать итоговый JS из строк тела. */
export function buildApp(fnName, bodyLines, indent = '  ') {
  const body = bodyLines.filter(Boolean).map((l) => (l.startsWith('\n') ? l : indent + l));
  return `function ${fnName}() {\n${body.join('\n')}\n}\n`;
}

/** Отступ строки для вложенных блоков (if / for). */
export const deep = (level) => '  '.repeat(level + 1);