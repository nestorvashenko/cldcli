import fs from 'fs';
import path from 'path';

export function readPackageJson(projectRoot) {
  const filePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('package.json не найден');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function writePackageJson(projectRoot, data) {
  const filePath = path.join(projectRoot, 'package.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}