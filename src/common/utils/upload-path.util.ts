import { join, dirname } from 'path';
import * as fs from 'fs';

/**
 * Retorna la ruta absoluta al directorio raíz `backend/uploads`.
 * Resuelve de manera determinista e idéntica tanto en ejecución con ts-node (src/)
 * como con código compilado (dist/ o dist/src/).
 */
export function getUploadsRootPath(): string {
  // 1. Si existe variable de entorno específica
  if (process.env.UPLOADS_DIR) {
    return ensureUploadsStructure(process.env.UPLOADS_DIR);
  }

  // 2. Buscar hacia arriba el directorio 'backend' a partir del package.json correspondiente
  let currentDir = __dirname;
  while (currentDir && currentDir !== dirname(currentDir)) {
    const pkgPath = join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'backend') {
          return ensureUploadsStructure(join(currentDir, 'uploads'));
        }
      } catch {
        // Continuar buscando hacia arriba
      }
    }
    currentDir = dirname(currentDir);
  }

  // 3. Fallback basado en process.cwd()
  const cwd = process.cwd();
  if (fs.existsSync(join(cwd, 'backend', 'uploads'))) {
    return ensureUploadsStructure(join(cwd, 'backend', 'uploads'));
  }
  if (fs.existsSync(join(cwd, 'uploads'))) {
    return ensureUploadsStructure(join(cwd, 'uploads'));
  }

  return ensureUploadsStructure(join(cwd, 'uploads'));
}

/**
 * Garantiza que la carpeta raíz y las subcarpetas estándar (brands, models, users) existan en disco.
 */
function ensureUploadsStructure(rootPath: string): string {
  if (!fs.existsSync(rootPath)) {
    fs.mkdirSync(rootPath, { recursive: true });
  }

  const standardFolders = ['brands', 'models', 'users'];
  for (const folder of standardFolders) {
    const folderPath = join(rootPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }

  return rootPath;
}

