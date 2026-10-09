/**
 * cldcli init — создание нового приложения ColdOS.
 *
 * Язык выбирается флагом --lang или в интерактивном режиме.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { log } from '../core/logger.js';
import { CldError, fail } from '../core/errors.js';
import { ask } from '../cli/prompt.js';
import { getLanguage, listLanguages, DEFAULT_LANG } from '../lang/index.js';
import { readPackageJson, writePackageJson } from '../utils/config.js';
import { cloneTemplate, fillProject, sanitizeAppId, entryFnName } from '../utils/template.js';
import { DEFAULT_CATEGORY } from '../constants.js';

export async function runInit(appName, flags = {}) {
  if (!appName) {
    throw new CldError('Укажите название приложения: cldcli init myapp');
  }

  // Валидация языка до любых файловых операций
  let lang;
  if (flags.lang) {
    lang = getLanguage(String(flags.lang).toLowerCase());
    if (!lang || String(flags.lang).toLowerCase() === 'undefined') {
      const names = listLanguages().map((l) => l.id).join(', ');
      throw new CldError(`Неизвестный язык "${flags.lang}".\n  Доступные: ${names}`);
    }
  }

  const projectRoot = path.join(process.cwd(), appName);
  if (fs.existsSync(projectRoot)) {
    throw new CldError(`Папка ${appName} уже существует.`);
  }

  const interactive = process.stdin.isTTY && !flags.lang;
  const questions = [];
  if (interactive) {
    questions.push(
      { key: 'lang', text: `Язык (${listLanguages().map((l) => l.id).join(', ')})`, default: DEFAULT_LANG },
      { key: 'displayName', text: 'Отображаемое имя', default: appName }
    );
  }

  let answers = {};
  if (questions.length) {
    log.info(`\nСоздаём приложение ColdOS: ${log.bold(appName)}`);
    answers = await ask(questions);
  }

  const chosen = lang || getLanguage(answers.lang || DEFAULT_LANG);
  const displayName = answers.displayName || flags.name || appName;
  const description = flags.desc || `${displayName} — приложение для ColdOS`;
  const author = flags.author || os.userInfo().username || 'Developer';
  const category = flags.category || DEFAULT_CATEGORY;

  if (!lang) log.info(`\nСоздаём приложение ColdOS: ${log.bold(appName)}`);
  log.dim(`  Язык: ${chosen.label}`);
  log.dim(`  ${chosen.notes}`);

  cloneTemplate(chosen.repo, projectRoot);

  const appId = sanitizeAppId(appName);

  // Метаданные проекта
  const pkg = readPackageJson(projectRoot);
  pkg.name = appId;
  pkg.displayName = displayName;
  pkg.description = description;
  pkg.author = author;
  pkg.category = category;
  pkg.lang = chosen.id;
  writePackageJson(projectRoot, pkg);

  // Плейсхолдеры в исходниках, README и стилях
  fillProject(projectRoot, {
    APP_ID: appId,
    ENTRY_FN: entryFnName(appId),
    DISPLAY_NAME: displayName,
    DESCRIPTION: description,
    AUTHOR: author,
    CATEGORY: category,
    LANG_LABEL: chosen.label
  });

  success(appName, appId, chosen);
}

function success(appName, appId, lang) {
  log.success(`\nПроект ${log.bold(appName)} создан (${lang.label})`);
  log.cyan('\nСледующие шаги:');
  log.dim(`  1. cd ${appName}`);
  log.dim('  2. Положите иконки в assets/:');
  log.dim('     icon.png, icon@dark.png,');
  log.dim('     icon@darktransparent.png, icon@transparent.png');
  log.dim('  3. Откройте src/' + path.basename(lang.entry) + ' и напишите приложение');
  log.dim('  4. cldcli build\n');
}

export { fail };