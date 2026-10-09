/**
 * Сборка приложения ColdOS.
 *
 * ColdOS исполняет JavaScript, поэтому для языков, отличных от JS, сначала
 * вызывается соответствующий парсер (pr*.js), результат которого кладётся
 * в Core/<id>.js как обычный JS.
 */

import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';
import { version as esbuildVersion } from 'esbuild';
import AdmZip from 'adm-zip';
import { log } from '../core/logger.js';
import { CldError, ParseError, fail } from '../core/errors.js';
import { readPackageJson } from '../utils/config.js';
import { getLanguage } from '../lang/index.js';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  MAX_HEIGHT,
  MAX_WIDTH,
  COMPILER_TARGET
} from '../constants.js';

// Имя файла assets/ -> суффикс Core/<id><суффикс>.png
const ICONS = {
  'icon.png': '',
  'icon@dark.png': '_dark',
  'icon@darktransparent.png': '_darktransparent',
  'icon@transparent.png': '_transparent'
};

export async function runBuild() {
  const projectRoot = process.cwd();
  const pkg = readPackageJson(projectRoot);

  const appId = pkg.name;
  if (!appId) throw new CldError('В package.json отсутствует поле name.');

  const lang = getLanguage(pkg.lang);
  if (!lang) throw new CldError(`Неизвестный язык в package.json: ${pkg.lang}`);

  const displayName = pkg.displayName || appId;
  const description = pkg.description || appId;
  const author = pkg.author || 'Developer';
  const category = pkg.category || 'Development';
  const version = pkg.version || '1.0.0';

  const entryPath = path.join(projectRoot, lang.entry);
  if (!fs.existsSync(entryPath)) {
    throw new CldError(
      `Файл ${lang.entry} не найден.\n  Укажите другой язык: cldcli init --lang <${langsHint()}>`
    );
  }

  log.info(`\nСборка приложения ColdOS: ${log.bold(appId)}`);
  log.dim(`  Язык: ${lang.label} (${lang.extension})`);

  const buildDir = path.join(projectRoot, 'build');
  const unpackagedDir = path.join(buildDir, 'unpackaged');
  const coreDir = path.join(unpackagedDir, 'Core');
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(coreDir, { recursive: true });

  const source = fs.readFileSync(entryPath, 'utf8');
  const ctx = { appId, displayName, packageName: lang.id };

  log.cyan('  Компиляция...');
  let code;
  try {
    const parser = await lang.parser();
    const result = await parser.parse(source, ctx);
    code = await minifyIfNeeded(result.code, lang);
  } catch (error) {
    fail(error);
  }

  verifyEntry(code, appId, lang);

  code = code.replace(/\{\{COMPILER_VER\}\}/g, `esbuild ${esbuildVersion} (${lang.label})`);
  fs.writeFileSync(path.join(coreDir, `${appId}.js`), code);
  log.success(`  Core/${appId}.js`);

  copyCss(projectRoot, coreDir, appId);
  const icons = copyIcons(projectRoot, coreDir, appId);

  writeMetadata(unpackagedDir, { appId, displayName, description, author, category, version });

  const zip = new AdmZip();
  zip.addLocalFolder(unpackagedDir);
  const outFile = path.join(buildDir, `${appId}.cuapp`);
  zip.writeZip(outFile);

  report({ appId, lang, icons, outFile });
}

/**
 * JS-парсеры уже дают исполняемый код; минификация применима только там,
 * где esbuild может разобрать результат.
 */
async function minifyIfNeeded(code, lang) {
  if (lang.id === 'js' || lang.id === 'ts') return code;
  try {
    const result = await esbuild.transform(code, {
      loader: 'js',
      target: COMPILER_TARGET,
      minify: false,
      charset: 'utf8'
    });
    return result.code;
  } catch (error) {
    throw new ParseError(
      lang.id,
      'Результат конвертации не является корректным JavaScript.',
      error?.errors?.[0]?.text || 'Проверьте исходный файл',
      error?.errors?.[0]?.location?.line ?? null
    );
  }
}

function verifyEntry(code, appId, lang) {
  const expected = `function user_run_application_${appId}(`;
  if (!code.includes(expected)) {
    throw new ParseError(
      lang.id,
      `В собранном коде нет функции user_run_application_${appId}().`,
      'Точка входа должна называться user_run_application_<id>, где id — поле name в package.json.',
      null
    );
  }
}

function copyCss(projectRoot, coreDir, appId) {
  const css = path.join(projectRoot, 'src', 'index.css');
  const target = path.join(coreDir, `${appId}.css`);
  if (fs.existsSync(css)) {
    fs.copyFileSync(css, target);
    log.success(`  Core/${appId}.css`);
  } else {
    fs.writeFileSync(target, '');
  }
}

function copyIcons(projectRoot, coreDir, appId) {
  const assetsDir = path.join(projectRoot, 'assets');
  let found = 0;

  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir)) {
      const suffix = ICONS[file];
      if (suffix === undefined) continue;
      const src = path.join(assetsDir, file);
      if (fs.statSync(src).size === 0) continue;
      fs.copyFileSync(src, path.join(coreDir, `${appId}${suffix}.png`));
      found++;
    }
  }

  if (found === 0) {
    log.warn('  Иконки не найдены в assets/');
    log.dim('    Положите icon.png и icon@dark.png, затем пересоберите');
  }
  return found;
}

function writeMetadata(unpackagedDir, m) {
  const info = [
    `Name=${m.displayName}`,
    `ID=${m.appId}`,
    `Version=${m.version}.0`,
    `Author=${m.author}`,
    `Category=${m.category}`
  ].join('\n');
  fs.writeFileSync(path.join(unpackagedDir, 'Info.cfg'), info + '\n');
  fs.writeFileSync(path.join(unpackagedDir, 'Description.txt'), m.description + '\n');
  fs.writeFileSync(path.join(unpackagedDir, 'LICENSE'), 'MIT License\n');
}

function report({ appId, lang, icons, outFile }) {
  log.success('\nСборка завершена');
  log.cyan(` build/${appId}.cuapp`);
  log.dim(`   язык: ${lang.label}`);
  log.dim(`   иконок: ${icons}/4`);
  log.dim(`   размер: ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB\n`);
}

const langsHint = () => 'ts|js|python|kotlin|go|php';