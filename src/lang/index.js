/**
 * Реестр языков.
 *
 * ColdOS исполняет только JavaScript, поэтому каждый язык — это исходник,
 * который cldcli приводит к JS (парсер) плюс шаблонный репозиторий.
 */
export const LANGUAGES = {
  ts: {
    id: 'ts',
    label: 'TypeScript',
    extension: 'ts',
    repo: 'https://github.com/nestorvashenko/cuapp-ts.git',
    entry: 'src/main.ts',
    parser: () => import('../parsers/prts.js'),
    scan: { lineComment: '//', blockComment: true },
    notes: 'Нативная поддержка: TypeScript компилируется esbuild.'
  },
  js: {
    id: 'js',
    label: 'JavaScript',
    extension: 'js',
    repo: 'https://github.com/nestorvashenko/cuapp-js.git',
    entry: 'src/main.js',
    parser: () => import('../parsers/prjs.js'),
    scan: { lineComment: '//', blockComment: true, backtick: true },
    notes: 'Нативная поддержка: JS копируется как есть.'
  },
  python: {
    id: 'python',
    label: 'Python',
    extension: 'py',
    repo: 'https://github.com/nestorvashenko/cuapp-python.git',
    entry: 'src/main.py',
    parser: () => import('../parsers/prpython.js'),
    scan: { hashComment: true, tripleQuotes: true },
    notes: 'Подмножество: def, присваивания, f-строки, dict, вызовы ColdOS.'
  },
  kotlin: {
    id: 'kotlin',
    label: 'Kotlin',
    extension: 'kt',
    repo: 'https://github.com/nestorvashenko/cuapp-kotlin.git',
    entry: 'src/main.kt',
    parser: () => import('../parsers/prkotlin.js'),
    scan: { lineComment: '//', blockComment: true, tripleQuotes: true },
    notes: 'Подмножество: fun, val/var, строковые шаблоны, mapOf, вызовы ColdOS.'
  },
  go: {
    id: 'go',
    label: 'Go',
    extension: 'go',
    repo: 'https://github.com/nestorvashenko/cuapp-go.git',
    entry: 'src/main.go',
    parser: () => import('../parsers/prgo.js'),
    scan: { lineComment: '//', blockComment: true, backtick: true },
    notes: 'Подмножество: func, :=, fmt.Sprintf, map[string]interface{}, вызовы ColdOS.'
  },
  php: {
    id: 'php',
    label: 'PHP',
    extension: 'php',
    repo: 'https://github.com/nestorvashenko/cuapp-php.git',
    entry: 'src/main.php',
    parser: () => import('../parsers/prphp.js'),
    scan: { lineComment: '//', hashComment: true, blockComment: true },
    notes: 'Подмножество: function, $переменные, интерполяция "$var", вызовы ColdOS.'
  }
};

export const DEFAULT_LANG = 'ts';

export const LANG_IDS = Object.keys(LANGUAGES);

export function getLanguage(id) {
  if (!id) return LANGUAGES[DEFAULT_LANG];
  const lang = LANGUAGES[id];
  if (!lang) return null;
  return lang;
}

export function listLanguages() {
  return LANG_IDS.map((id) => LANGUAGES[id]);
}