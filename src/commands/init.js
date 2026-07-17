import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { log } from '../utils/logger.js';
import { readPackageJson, writePackageJson } from '../utils/config.js';
import { cloneTemplate, copyTemplate, updateMainTs } from '../utils/template.js';
import { DEFAULT_CATEGORY } from '../constants.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

export async function runInit(appName) {
  if (!appName) {
    log.error('Ошибка: Укажите название приложения!');
    process.exit(1);
  }

  const projectRoot = path.join(process.cwd(), appName);
  if (fs.existsSync(projectRoot)) {
    log.error(`Ошибка: Папка ${appName} уже существует!`);
    process.exit(1);
  }

  log.info(`\nСоздаем новый проект ColdOS: ${log.bold(appName)}...\n`);

  const displayName = await question('Display name (отображаемое имя): ') || appName;
  const description = await question('Описание приложения: ') || `${appName} — приложение для ColdOS`;
  const defaultAuthor = os.userInfo().username || 'Developer';
  const author = await question(`Автор (по умолчанию: ${defaultAuthor}): `) || defaultAuthor;
  const category = await question('Категория (Development, Games, Utilities, etc): ') || DEFAULT_CATEGORY;

  rl.close();

  const tempDir = path.join(os.tmpdir(), `cuapp-${Date.now()}`);
  
  if (!cloneTemplate(tempDir)) {
    process.exit(1);
  }

  copyTemplate(tempDir, projectRoot);

  const appId = appName.toLowerCase();
  const pkg = readPackageJson(projectRoot);
  
  pkg.name = appId;
  pkg.displayName = displayName;
  pkg.description = description;
  pkg.author = author;
  pkg.category = category;
  writePackageJson(projectRoot, pkg);

  const mainTsPath = path.join(projectRoot, 'src', 'main.ts');
  updateMainTs(mainTsPath, appId, displayName);

  log.success(`\nПроект ${log.bold(appName)} успешно создан!`);
  log.cyan('Следующие шаги:');
  log.dim(`  1. cd ${appName}`);
  log.dim('  2. Положите иконки в папку assets/');
  log.dim('     - icon.png (обычная иконка)');
  log.dim('     - icon@dark.png (темная тема)');
  log.dim('     - icon@darktransparent.png (темная прозрачная)');
  log.dim('     - icon@transparent.png (прозрачная)');
  log.dim('  3. cldcli build');
  console.log('');
}