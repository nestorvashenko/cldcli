import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { log } from './logger.js';
import { TEMPLATE_REPO } from '../constants.js';

export function cloneTemplate(tempDir) {
  log.info('Клонирую шаблон с GitHub...');
  try {
    execSync(`git clone ${TEMPLATE_REPO} ${tempDir}`, {
      stdio: 'ignore',
      encoding: 'utf-8'
    });
    log.success('Шаблон склонирован успешно');
    return true;
  } catch (error) {
    log.error('Ошибка клонирования репозитория. Проверьте интернет-соединение.');
    return false;
  }
}

export function copyTemplate(tempDir, projectRoot) {
  fs.cpSync(tempDir, projectRoot, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
}

export function updateMainTs(mainTsPath, appId, displayName) {
  let content = fs.readFileSync(mainTsPath, 'utf-8');
  
  const replacements = [
    [/function user_run_application_template\(\)/g, `function user_run_application_${appId}()`],
    [/const id_app = "template";/g, `const id_app = "${appId}";`],
    [/const actiontextname = "Шаблон";/g, `const actiontextname = "${displayName}";`],
    [/const tooltip_app = "Шаблон приложения";/g, `const tooltip_app = "${displayName}";`],
    [/const classdock = "system";/g, `const classdock = "user";`],
    [/Шаблон приложения/g, displayName],
    [/Это минималистичное приложение для ColdOS/g, displayName]
  ];

  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });

  fs.writeFileSync(mainTsPath, content);
}