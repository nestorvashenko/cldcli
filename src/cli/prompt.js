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
      const suffix = q.default ? ` (${q.default})` : '';
      const value = await question(rl, `  ${q.text}${suffix}: `);
      answers[q.key] = value.trim() || q.default || '';
    }
  } finally {
    rl.close();
  }

  return answers;
}

const question = (rl, text) =>
  new Promise((resolve) => rl.question(text, resolve));

/** Выводит меню выбора одного варианта из списка. */
export function menu(title, items) {
  log.cyan(title);
  items.forEach((item, i) => {
    log.dim(`   ${i + 1}) ${item.label}`);
  });
}

export { log };