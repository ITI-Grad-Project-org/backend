import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let errors = null;

    if (exception instanceof HttpException) {
      const responseObject: any = exception.getResponse();

      // Handle validation errors
      if (responseObject && typeof responseObject === 'object') {
        if (Array.isArray(responseObject.message)) {
          message = 'Validation failed';
          errors = responseObject.message;
        } else if (responseObject.message) {
          message = responseObject.message;
        }
      } else {
        message = responseObject || exception.message;
      }
    }

    this.logger.error(`${request.method} ${request.url}`, exception.stack);

    const errorResponse = {
      statusCode: status,
      message: message,
      errors: errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    Object.keys(errorResponse).forEach(
      (key) => errorResponse[key] === null && delete errorResponse[key],
    );

    response.status(status).json(errorResponse);
  }
}
