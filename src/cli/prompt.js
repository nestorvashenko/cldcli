/**
 * Интерактивные вопросы.
 */

import readline from 'readline';
import { log } from '../core/logger.js';

/**
 * Создаёт интерфейс и по очереди задаёт вопросы.
 * Пустой ответ возвращает значение по умолчанию.
 */
export async function ask(questions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answers = {};
  try {
    for (const q of questions) {
      // default может быть функцией от предыдущих ответов
      const value = typeof q.default === 'function' ? q.default(answers) : q.default;
      const suffix = value ? ` (${value})` : '';
      const answer = await question(rl, `  ${q.text}${suffix}: `);
      answers[q.key] = answer.trim() || value || '';
    }
  } finally {
    rl.close();
  }

  return answers;
}

/**
 * Задаёт один вопрос.
 * Если ввод закрылся (пайп, CI, EOF) — возвращает пустую строку,
 * чтобы команда продолжила работу на значениях по умолчанию,
 * а не упала с ERR_USE_AFTER_CLOSE.
 */
const question = (rl, text) =>
  new Promise((resolve) => {
    // question() бросает синхронно на закрытом интерфейсе,
    // поэтому проверяем заранее, а не ловим исключение
    if (rl.closed) return resolve('');

    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    rl.question(text, (answer) => done(answer));
    rl.once('close', () => done(''));
  });

/** Выводит меню выбора одного варианта из списка. */
export function menu(title, items) {
  log.cyan(title);
  items.forEach((item, i) => {
    log.dim(`   ${i + 1}) ${item.label}`);
  });
}

export { log };