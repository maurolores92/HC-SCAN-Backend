import { BadRequestException } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { basename, extname, join } from 'path';
import * as crypto from 'crypto';
import {
  getTenantQuarantinePath,
  getTenantVaultMonthlyPath,
} from '../../../common/utils/storage-path.util';

export interface PreparedDocumentStorageTarget {
  physicalFileName: string;
  fullPhysicalPath: string;
  relativePath: string;
  fileHash: string;
}

const sanitizeBaseFileName = (originalName: string): string => {
  const cleaned = basename(originalName)
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return cleaned || 'documento';
};

export const computeBufferSha256 = (buffer: Buffer): string =>
  crypto.createHash('sha256').update(buffer).digest('hex');

export const isValidPdfBufferHeader = (buffer: Buffer): boolean => {
  if (!buffer || buffer.length < 5) return false;
  const header = buffer.subarray(0, 1024).toString('latin1');
  return header.includes('%PDF-');
};

/**
 * Valida que el archivo recibido desde la web sea un PDF íntegro.
 */
export const assertValidPdfUpload = (file: Express.Multer.File | undefined): void => {
  if (!file) {
    throw new BadRequestException('El archivo PDF es requerido');
  }

  const ext = extname(file.originalname).toLowerCase();
  if (ext !== '.pdf' || file.mimetype !== 'application/pdf') {
    throw new BadRequestException('Solo se permite la carga de archivos en formato PDF');
  }

  if (file.buffer && !isValidPdfBufferHeader(file.buffer)) {
    throw new BadRequestException('El archivo subido no posee una cabecera PDF válida');
  }
};

/**
 * Prepara la ruta en `storage/tenancy/company_<id>/vault/YYYY/MM/` y calcula SHA-256.
 */
export const prepareTenantPdfStorageTarget = (
  companyId: number,
  file: Express.Multer.File,
): PreparedDocumentStorageTarget => {
  const { absoluteDir, relativeDir } = getTenantVaultMonthlyPath(companyId);
  const cleanBaseName = sanitizeBaseFileName(file.originalname);
  const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
  const physicalFileName = `${cleanBaseName}_${uniqueSuffix}.pdf`;
  const fullPhysicalPath = join(absoluteDir, physicalFileName);
  const relativePath = `${relativeDir}/${physicalFileName}`;
  const fileHash = computeBufferSha256(file.buffer);

  return {
    physicalFileName,
    fullPhysicalPath,
    relativePath,
    fileHash,
  };
};

const safeMoveFile = (sourcePath: string, destinationPath: string): void => {
  try {
    renameSync(sourcePath, destinationPath);
  } catch {
    copyFileSync(sourcePath, destinationPath);
    if (existsSync(sourcePath)) {
      unlinkSync(sourcePath);
    }
  }
};

/**
 * Mueve un archivo detectado en `inbox/` hacia la bóveda definitiva `vault/YYYY/MM/`.
 */
export const moveInboxFileToVault = (
  companyId: number,
  sourcePath: string,
  originalName: string,
): PreparedDocumentStorageTarget & { fileSize: number } => {
  const buffer = readFileSync(sourcePath);
  const { absoluteDir, relativeDir } = getTenantVaultMonthlyPath(companyId);
  const cleanBaseName = sanitizeBaseFileName(originalName);
  const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
  const physicalFileName = `${cleanBaseName}_${uniqueSuffix}.pdf`;
  const fullPhysicalPath = join(absoluteDir, physicalFileName);
  const relativePath = `${relativeDir}/${physicalFileName}`;
  const fileHash = computeBufferSha256(buffer);

  safeMoveFile(sourcePath, fullPhysicalPath);

  return {
    physicalFileName,
    fullPhysicalPath,
    relativePath,
    fileHash,
    fileSize: buffer.length,
  };
};

/**
 * Deriva un archivo rechazado (inválido, duplicado o retenido por cupo) a `quarantine/`.
 */
export const moveInboxFileToQuarantine = (
  companyId: number,
  sourcePath: string,
  reasonPrefix: 'invalid' | 'duplicate' | 'quota',
): string => {
  const quarantineDir = getTenantQuarantinePath(companyId);
  const safeName = basename(sourcePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destPath = join(quarantineDir, `${reasonPrefix}_${Date.now()}_${safeName}`);
  if (existsSync(sourcePath)) {
    safeMoveFile(sourcePath, destPath);
  }
  return destPath;
};
