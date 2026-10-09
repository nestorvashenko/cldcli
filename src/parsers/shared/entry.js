/**
 * Общая логика точки входа.
 *
 * ColdOS запускает функцию по имени из метаданных приложения (ID в Info.cfg),
 * поэтому после конвертации в пакете должна остаться ровно одна функция
 * user_run_application_<id>.
 */

export const entryBase = 'user_run_application';

export function entryName(appId) {
  return `${entryBase}_${appId}`;
}

/** Точное совпадение по ID приложения. */
export function ENTRY_RE(appId) {
  return new RegExp(`function\\s+${entryName(appId)}\\s*\\(`);
}

/**
 * Мягкое совпадение: любое имя user_run_application_*.
 * Используется, когда ID ещё неизвестен (на этапе валидации шаблона).
 */
export function hasEntry(code) {
  const m = /function\s+(user_run_application_[A-Za-z0-9_$]+)\s*\(/.exec(code);
  return m ? m[1] : null;
}

/**
 * Снимает обёртку ES-модуля, которую оставляет esbuild, — ColdOS
 * исполняет файл как скрипт, а `export`/`import` в нём недопустимы.
 */
export function stripModuleWrapper(code) {
  return code
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+/gm, '')
    .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
    .replace(/^\s*\(\s*\(\s*\)\s*=>\s*\{/, '')
    .replace(/\}\s*\)\s*\(\s*\)\s*;\s*$/, '')
    .trim();
}