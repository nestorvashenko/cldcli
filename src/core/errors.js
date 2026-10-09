export class CldError extends Error {}

/**
 * Ошибка пользователя: печатается без стектрейса.
 * Ошибка компиляции шаблона: сообщение + подсказка + исходная строка.
 */
export class ParseError extends CldError {
  constructor(lang, message, hint = '', line = null) {
    super(message);
    this.lang = lang;
    this.hint = hint;
    this.line = line;
  }
}

export function fail(err) {
  if (err instanceof ParseError) {
    console.error('');
    console.error(`  Ошибка [${err.lang}]: ${err.message}`);
    if (err.line !== null && err.line !== undefined) {
      console.error(`  Строка ${err.line}`);
    }
    if (err.hint) {
      console.error(`  Подсказка: ${err.hint}`);
    }
    console.error('');
    process.exit(1);
  }
  if (err instanceof CldError) {
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}