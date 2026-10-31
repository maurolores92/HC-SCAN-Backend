import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Param,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { getUploadsRootPath } from '../../common/utils/upload-path.util';
import { isPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

const ALLOWED_FOLDERS = ['users', 'companies'];

@Controller('uploads')
export class UploadsController {
  @Post(':folder')
  @Auth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const folder = req.params.folder as string;
          if (!ALLOWED_FOLDERS.includes(folder)) {
            return cb(
              new BadRequestException(
                `Carpeta de destino no válida. Los documentos PDF deben cargarse mediante /documents/upload.`,
              ),
              '',
            );
          }

          if (folder === 'companies' && !isPlatformSuperAdmin((req as any).user)) {
            return cb(
              new ForbiddenException(
                'Solo el Super Administrador puede cargar logotipos de compañías.',
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
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          const cleanName = file.originalname
            .split('.')[0]
            .replace(/[^a-zA-Z0-9]/g, '');
          const filename = `${cleanName}-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const isImage = file.mimetype.match(/\/(jpg|jpeg|png|webp)$/);
        if (!isImage) {
          return cb(
            new BadRequestException('Solo se permiten imágenes en formato JPG, PNG o WEBP'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
    @GetUser() user: any,
  ) {
    if (folder === 'companies' && !isPlatformSuperAdmin(user)) {
      throw new ForbiddenException('Solo el Super Administrador puede cargar logotipos de compañías.');
    }
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
