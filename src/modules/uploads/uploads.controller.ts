import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Auth } from '../auth/decorators/auth.decorator';
import { getUploadsRootPath } from '../../common/utils/upload-path.util';

const ALLOWED_FOLDERS = ['documents', 'users', 'companies'];

@Controller('uploads')
export class UploadsController {
  @Post(':folder')
  @Auth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const folder = req.params.folder as string;
          if (!ALLOWED_FOLDERS.includes(folder)) {
            return cb(
              new BadRequestException(
                `Carpeta de destino no válida. Permitidas: ${ALLOWED_FOLDERS.join(', ')}`,
              ),
              '',
            );
          }

          const uploadPath = join(getUploadsRootPath(), folder);
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }

          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          const cleanName = file.originalname
            .split('.')[0]
            .replace(/[^a-zA-Z0-9]/g, '');
          const filename = `${cleanName}-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        const folder = req.params.folder;
        const isPdf = file.mimetype === 'application/pdf';
        const isImage = file.mimetype.match(/\/(jpg|jpeg|png|webp)$/);

        if (folder === 'documents' && !isPdf) {
          return cb(
            new BadRequestException('En la carpeta de documentos solo se permiten archivos PDF'),
            false,
          );
        }

        if ((folder === 'users' || folder === 'companies') && !isImage) {
          return cb(
            new BadRequestException('Para imágenes de usuario y compañías solo se permiten JPG, PNG o WEBP'),
            false,
          );
        }

        cb(null, true);
      },
      limits: {
        fileSize: 25 * 1024 * 1024, // Límite de 25MB para documentos
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
  ) {
    if (!file) {
      throw new BadRequestException('El archivo es requerido');
    }

    return {
      message: 'Archivo subido correctamente',
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: `/api/images/${folder}/${file.filename}`,
    };
  }
}
