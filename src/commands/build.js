import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';
import { version as esbuildVersion } from 'esbuild';
import AdmZip from 'adm-zip';
import { log } from '../utils/logger.js';
import { readPackageJson } from '../utils/config.js';

export async function runBuild() {
  const projectRoot = process.cwd();
  
  let pkg;
  try {
    pkg = readPackageJson(projectRoot);
  } catch (error) {
    log.error('Ошибка: Файл package.json не найден.');
    process.exit(1);
  }

  const appId = pkg.name;
  const displayName = pkg.displayName || appId;
  const appDescription = pkg.description || appId;
  const author = pkg.author || 'Developer';
  const category = pkg.category || 'Development';

  if (appId === 'cldcli') {
    log.warn('Перейдите в папку созданного приложения ColdOS перед сборкой.');
    process.exit(1);
  }

  log.info(`\nКомпиляция приложения ColdOS: ${log.bold(appId)}...`);

  const buildDir = path.join(projectRoot, 'build');
  const unpackagedDir = path.join(buildDir, 'unpackaged');
  const coreDir = path.join(unpackagedDir, 'Core');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(coreDir, { recursive: true });

  try {
    const compilerVer = `esbuild ${esbuildVersion} (TypeScript ES2022)`;
    log.dim(`  Компилятор: ${compilerVer}`);

    log.cyan('  Компилирую TypeScript...');
    
    const buildResult = await esbuild.build({
      entryPoints: [path.join(projectRoot, 'src', 'main.ts')],
      bundle: false,
      write: false,
      target: 'es2022',
      minify: false,
      charset: 'utf8',
    });

    let code = buildResult.outputFiles[0].text;
    code = code.replace(/^\s*\(\s*\(\s*\)\s*=>\s*\{/, '');
    code = code.replace(/}\s*\)\s*\(\s*\)\s*;\s*$/, '');
    code = code.replace(/^\/\/.*\n/gm, '');
    code = code.trim();

    if (!code.includes(`function user_run_application_${appId}()`)) {
      log.warn(`Предупреждение: функция user_run_application_${appId} не найдена в коде!`);
    }

    code = code.replace(/\{\{COMPILER_VER\}\}/g, compilerVer);

    fs.writeFileSync(path.join(coreDir, `${appId}.js`), code);
    log.success(`  JS собран в unpackaged/Core/${appId}.js`);

    const srcCss = path.join(projectRoot, 'src', 'index.css');
    if (fs.existsSync(srcCss)) {
      fs.copyFileSync(srcCss, path.join(coreDir, `${appId}.css`));
      log.success(`  CSS скопирован в Core/${appId}.css`);
    } else {
      fs.writeFileSync(path.join(coreDir, `${appId}.css`), '');
    }

    log.cyan('  Обрабатываю иконки...');
    const assetsDir = path.join(projectRoot, 'assets');
    const imageMap = {
      'icon.png': `${appId}.png`,
      'icon@dark.png': `${appId}_dark.png`,
      'icon@darktransparent.png': `${appId}_darktransparent.png`,
      'icon@transparent.png': `${appId}_transparent.png`,
    };

    let iconsFound = 0;
    if (fs.existsSync(assetsDir)) {
      Object.entries(imageMap).forEach(([srcName, targetName]) => {
        const srcPath = path.join(assetsDir, srcName);
        if (fs.existsSync(srcPath) && fs.statSync(srcPath).size > 0) {
          fs.copyFileSync(srcPath, path.join(coreDir, targetName));
          iconsFound++;
          log.dim(`    ${srcName} -> Core/${targetName}`);
        }
      });
    }

    if (iconsFound === 0) {
      log.warn('Предупреждение: иконки не найдены в assets/');
      log.dim('    Положите icon.png, icon@dark.png в папку assets/ и пересоберите');
    } else {
      log.success(`  Иконки скопированы в Core/ (${iconsFound} файлов)`);
    }

    log.cyan('  Создаю метаданные...');
    const infoCfg = `Name=${displayName}\nID=${appId}\nVersion=${pkg.version}.0\nAuthor=${author}\nCategory=${category}`;
    fs.writeFileSync(path.join(unpackagedDir, 'Info.cfg'), infoCfg);
    fs.writeFileSync(path.join(unpackagedDir, 'Description.txt'), appDescription);
    fs.writeFileSync(path.join(unpackagedDir, 'LICENSE'), 'MIT License');
    
    log.success('  Метаданные созданы');

    log.cyan(`\nСжатие пакета в ${appId}.cuapp...`);
    
    const zip = new AdmZip();
    zip.addLocalFolder(unpackagedDir);
    zip.writeZip(path.join(buildDir, `${appId}.cuapp`));

    log.success('\nСборка успешно завершена!');
    log.dim('Результат:');
    log.cyan(` build/${appId}.cuapp  (Готовый пакет для установки)`);
    log.dim(` build/unpackaged/    (Исходная структура для отладки)`);
    log.dim('     Core/             (Все файлы приложения включая иконки)');
    log.dim(`         ${appId}.js`);
    log.dim(`         ${appId}.css`);
    log.dim(`         ${appId}.png`);
    log.dim(`         ${appId}_dark.png`);
    log.dim(`         ${appId}_darktransparent.png`);
    log.dim(`         ${appId}_transparent.png`);
    log.dim('     Info.cfg');
    log.dim('     Description.txt');
    log.dim('     LICENSE\n');

    log.success('Что дальше:');
    log.dim('  1. Скопируйте папку build/unpackaged/Core в приложение ColdOS');
    log.dim(`  2. Или отправьте build/${appId}.cuapp пользователю на установку\n`);
    process.exit(0);

  } catch (error) {
    log.error(`\nОшибка сборки: ${error.message}`);
    process.exit(1);
  }
}