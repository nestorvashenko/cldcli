import fs from 'fs';
import path from 'path';
import { CldError } from '../core/errors.js';

export function readPackageJson(projectRoot) {
  const filePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(filePath)) {
    throw new CldError('Файл package.json не найден. Запускайте cldcli build из папки приложения.');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function writePackageJson(projectRoot, data) {
  const filePath = path.join(projectRoot, 'package.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}