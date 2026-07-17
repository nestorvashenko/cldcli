#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import * as esbuild from 'esbuild';
import AdmZip from 'adm-zip';
import readline from 'readline';
import { execSync } from 'child_process';
import os from 'os';
import { version as esbuildVersion } from 'esbuild';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const [,, command, arg2] = process.argv;

if (command === 'init') {
  await runInit(arg2);
  process.exit(0);
} else if (command === 'build') {
  await runBuild();
  process.exit(0);
} else {
  console.log(pc.red('\nНеизвестная команда.'));
  console.log(pc.cyan('Доступные команды: cldcli init <name> | cldcli build\n'));
  process.exit(1);
}

async function runInit(appName) {
  if (!appName) {
    console.log(pc.red('\nОшибка: Укажите название приложения!'));
    process.exit(1);
  }

  const projectRoot = path.join(process.cwd(), appName);
  if (fs.existsSync(projectRoot)) {
    console.log(pc.red(`Ошибка: Папка ${appName} уже существует!`));
    process.exit(1);
  }

  console.log(pc.blue(`\nСоздаем новый проект ColdOS: ${pc.bold(appName)}...\n`));

  const displayName = await question('Display name (отображаемое имя): ') || appName;
  const description = await question('Описание приложения: ') || `${appName} — приложение для ColdOS`;
  const defaultAuthor = os.userInfo().username || 'Developer';
  const author = await question(`Автор (по умолчанию: ${defaultAuthor}): `) || defaultAuthor;
  const category = await question('Категория (Development, Games, Utilities, etc): ') || 'Development';

  rl.close();

  console.log(pc.blue('\nКлонирую шаблон с GitHub...'));
  
  const tempDir = path.join(os.tmpdir(), `cuapp-${Date.now()}`);
  try {
    execSync(`git clone https://github.com/nestorvashenko/cuapp-ts.git ${tempDir}`, { 
      stdio: 'ignore',
      encoding: 'utf-8'
    });
  } catch (error) {
    console.log(pc.red('Ошибка клонирования репозитория. Проверьте интернет-соединение.'));
    process.exit(1);
  }

  console.log(pc.green('Шаблон склонирован успешно'));

  fs.cpSync(tempDir, projectRoot, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });

  const appId = appName.toLowerCase();

  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.name = appId;
  pkg.displayName = displayName;
  pkg.description = description;
  pkg.author = author;
  pkg.category = category;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const mainTsPath = path.join(projectRoot, 'src', 'main.ts');
  let mainTs = fs.readFileSync(mainTsPath, 'utf-8');
  
  mainTs = mainTs.replace(/function user_run_application_template\(\)/g, `function user_run_application_${appId}()`);
  mainTs = mainTs.replace(/const id_app = "template";/g, `const id_app = "${appId}";`);
  mainTs = mainTs.replace(/const actiontextname = "Шаблон";/g, `const actiontextname = "${displayName}";`);
  mainTs = mainTs.replace(/const tooltip_app = "Шаблон приложения";/g, `const tooltip_app = "${displayName}";`);
  mainTs = mainTs.replace(/const classdock = "system";/g, `const classdock = "user";`);
  mainTs = mainTs.replace(/Шаблон приложения/g, displayName);
  mainTs = mainTs.replace(/Это минималистичное приложение для ColdOS/g, displayName);
  
  fs.writeFileSync(mainTsPath, mainTs);

  console.log(pc.green(`\nПроект ${pc.bold(appName)} успешно создан!`));
  console.log(pc.cyan('Следующие шаги:'));
  console.log(pc.gray(`  1. cd ${appName}`));
  console.log(pc.gray(`  2. Положите иконки в папку assets/`));
  console.log(pc.gray(`     - icon.png (обычная иконка)`));
  console.log(pc.gray(`     - icon@dark.png (темная тема)`));
  console.log(pc.gray(`     - icon@darktransparent.png (темная прозрачная)`));
  console.log(pc.gray(`     - icon@transparent.png (прозрачная)`));
  console.log(pc.gray(`  3. cldcli build`));
  console.log('');
}

async function runBuild() {
  const projectRoot = process.cwd();
  
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.log(pc.red('Ошибка: Файл package.json не найден.'));
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const appId = pkg.name;
  const displayName = pkg.displayName || appId;
  const appDescription = pkg.description || appId;
  const author = pkg.author || 'Developer';
  const category = pkg.category || 'Development';

  if (appId === 'cldcli') {
    console.log(pc.yellow('Перейдите в папку созданного приложения ColdOS перед сборкой.'));
    process.exit(1);
  }

  console.log(pc.blue(`\nКомпиляция приложения ColdOS: ${pc.bold(appId)}...`));

  const buildDir = path.join(projectRoot, 'build');
  const unpackagedDir = path.join(buildDir, 'unpackaged');
  const coreDir = path.join(unpackagedDir, 'Core');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(coreDir, { recursive: true });

  try {
    const compilerVer = `esbuild ${esbuildVersion} (TypeScript ES2022)`;
    console.log(pc.gray(`  Компилятор: ${compilerVer}`));

    console.log(pc.cyan('  Компилирую TypeScript...'));
    
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
      console.log(pc.yellow(`Предупреждение: функция user_run_application_${appId} не найдена в коде!`));
    }

    code = code.replace(/\{\{COMPILER_VER\}\}/g, compilerVer);

    fs.writeFileSync(path.join(coreDir, `${appId}.js`), code);
    console.log(pc.green(`  JS собран в unpackaged/Core/${appId}.js`));

    const srcCss = path.join(projectRoot, 'src', 'index.css');
    if (fs.existsSync(srcCss)) {
      fs.copyFileSync(srcCss, path.join(coreDir, `${appId}.css`));
      console.log(pc.green(`  CSS скопирован в Core/${appId}.css`));
    } else {
      fs.writeFileSync(path.join(coreDir, `${appId}.css`), '');
    }

    console.log(pc.cyan('  Обрабатываю иконки...'));
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
          console.log(pc.gray(`    ${srcName} -> Core/${targetName}`));
        }
      });
    }

    if (iconsFound === 0) {
      console.log(pc.yellow(`Предупреждение: иконки не найдены в assets/`));
      console.log(pc.gray(`    Положите icon.png, icon@dark.png в папку assets/ и пересоберите`));
    } else {
      console.log(pc.green(`  Иконки скопированы в Core/ (${iconsFound} файлов)`));
    }

    console.log(pc.cyan('  Создаю метаданные...'));
    const infoCfg = `Name=${displayName}\nID=${appId}\nVersion=${pkg.version}.0\nAuthor=${author}\nCategory=${category}`;
    fs.writeFileSync(path.join(unpackagedDir, 'Info.cfg'), infoCfg);
    fs.writeFileSync(path.join(unpackagedDir, 'Description.txt'), appDescription);
    fs.writeFileSync(path.join(unpackagedDir, 'LICENSE'), 'MIT License');
    
    console.log(pc.green(`  Метаданные созданы`));

    console.log(pc.cyan(`\nСжатие пакета в ${appId}.cuapp...`));
    
    const zip = new AdmZip();
    zip.addLocalFolder(unpackagedDir);
    zip.writeZip(path.join(buildDir, `${appId}.cuapp`));

    console.log(pc.green(`\nСборка успешно завершена!`));
    console.log(pc.gray(`Результат:`));
    console.log(pc.cyan(` build/${appId}.cuapp  (Готовый пакет для установки)`));
    console.log(pc.gray(` build/unpackaged/    (Исходная структура для отладки)`));
    console.log(pc.gray(`     Core/             (Все файлы приложения включая иконки)`));
    console.log(pc.gray(`         ${appId}.js`));
    console.log(pc.gray(`         ${appId}.css`));
    console.log(pc.gray(`         ${appId}.png`));
    console.log(pc.gray(`         ${appId}_dark.png`));
    console.log(pc.gray(`         ${appId}_darktransparent.png`));
    console.log(pc.gray(`         ${appId}_transparent.png`));
    console.log(pc.gray(`     Info.cfg`));
    console.log(pc.gray(`     Description.txt`));
    console.log(pc.gray(`     LICENSE\n`));

    console.log(pc.green(`Что дальше:`));
    console.log(pc.gray(`  1. Скопируйте папку build/unpackaged/Core в приложение ColdOS`));
    console.log(pc.gray(`  2. Или отправьте build/${appId}.cuapp пользователю на установку\n`));
    process.exit(0);

  } catch (error) {
    console.log(pc.red(`\nОшибка сборки:`), error.message);
    process.exit(1);
  }
}