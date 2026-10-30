import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || res;
    } else if (exception instanceof UniqueConstraintError) {
      status = HttpStatus.BAD_REQUEST;
      message = `El registro ya existe. Detalle: ${exception.errors.map((e) => e.message).join(', ')}`;
    } else if (exception instanceof ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = `Error de validación en la base de datos: ${exception.errors.map((e) => e.message).join(', ')}`;
    } else if (exception instanceof BaseError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      const ex: any = exception;
      const sqlMsg =
        ex.parent?.errors?.[0]?.message ||
        ex.original?.errors?.[0]?.message ||
        ex.parent?.originalError?.message ||
        ex.parent?.message ||
        ex.original?.message ||
        ex.message ||
        'Error desconocido en base de datos';
      this.logger.error(`Database BaseError detail: ${sqlMsg}`);
      message = `Error interno en la base de datos: ${sqlMsg}`;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Message: ${JSON.stringify(message)}`,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
