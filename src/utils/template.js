/**
 * Работа с шаблонными репозиториями.
 *
 * В шаблонах используются плейсхолдеры __APP_ID__ и т.д. вместо готовых
 * значений: иначе init пришлось бы искать конкретные строки в исходнике,
 * и любая правка текста в шаблоне ломала бы CLI.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { log } from '../core/logger.js';
import { CldError } from '../core/errors.js';

/**
 * Приводит имя приложения к корректному идентификатору.
 * Имя используется в имени функции точки входа (user_run_application_<id>),
 * поэтому дефисы и пробелы недопустимы: app-js -> app_js.
 */
export function sanitizeAppId(name) {
  let id = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  if (!id) throw new CldError(`Имя "${name}" не содержит допустимых символов для имени приложения.`);
  if (/^[0-9]/.test(id)) id = 'app_' + id;

  return id;
}

/** Имя функции точки входа ColdOS для приложения. */
export const entryFnName = (appId) => `user_run_application_${appId}`;

/** Подстановка значений в текст шаблона. */
export function applyPlaceholders(text, values) {
  return text.replace(/__([A-Z_]+)__/g, (match, key) => {
    if (key in values) return values[key];
    return match;
  });
}

/**
 * Клонирует репозиторий шаблона и копирует его содержимое (без .git)
 * в целевую директорию.
 */
export function cloneTemplate(repoUrl, projectRoot) {
  const tempDir = path.join(os.tmpdir(), `cldcli-${path.basename(repoUrl, '.git')}-${Date.now()}`);

  log.info(`  Клонирую шаблон ${path.basename(repoUrl, '.git')}...`);
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', repoUrl, tempDir], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
  } catch (error) {
    throw new CldError(
      `Не удалось получить шаблон ${repoUrl}.\n  Проверьте подключение к интернету и доступ к репозиторию.`
    );
  }

  copyWithoutGit(tempDir, projectRoot);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/** Рекурсивное копирование без служебной директории .git. */
export function copyWithoutGit(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyWithoutGit(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/**
 * Подставляет значения во все текстовые файлы проекта.
 * Плейсхолдеры в исходнике, package.json и README.
 */
export function fillProject(projectRoot, values) {
  const TEXT_EXT = new Set([
    '.ts', '.js', '.py', '.kt', '.go', '.php', '.css', '.json', '.md', '.txt', '.html'
  ]);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!TEXT_EXT.has(path.extname(entry.name))) continue;

      const content = fs.readFileSync(full, 'utf8');
      if (!content.includes('__')) continue;
      fs.writeFileSync(full, applyPlaceholders(content, values));
    }
  };

  walk(projectRoot);
}