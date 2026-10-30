import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadPath = join(__dirname, '../../../storage');

  async uploadFile(path: string, file: any) {
    try {
      const uuid = uuidv4();
      const ext = file.originalname.split('.').pop();
      const filename = `${uuid}.${ext}`;

      const fullPath = join(this.uploadPath, '/', path, filename);
      if (!existsSync(join(this.uploadPath, '/', path))) {
        mkdirSync(join(this.uploadPath, '/', path), { recursive: true });
      }

      // Guardar archivo físicamente
      writeFileSync(fullPath, file.buffer);
      return {
        ext,
        name: filename,
        uuid,
        url: `storage${path}/${filename}`,
        size: file.size,
        type: file.mimetype,
      };
    } catch (error: any) {
      this.logger.error(`Error al cargar el archivo: ${error.message}`);
      throw error;
    }
  }
}
