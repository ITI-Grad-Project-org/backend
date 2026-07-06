import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Socket } from 'socket.io';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(GlobalExceptionFilter.name);

	catch(exception: any, host: ArgumentsHost) {
		// This global filter also runs for WebSocket gateways. The HTTP path below
		// calls response.status().json() — methods a socket.io client does NOT
		// have — so running it in a WS context throws *inside* the filter, which
		// Nest then tries to handle again, producing an endless error loop. Branch
		// first.
		if (host.getType() !== 'http') {
			return this.catchWs(exception, host);
		}

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

	private catchWs(exception: any, host: ArgumentsHost) {
		const client = host.switchToWs().getClient<Socket>();

		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR;
		const message =
			exception instanceof HttpException
				? exception.message
				: 'Internal server error';

		this.logger.error(`ws exception: ${message}`, exception.stack);

		// Surface a structured error to the client instead of crashing the socket.
		client.emit('exception', {
			statusCode: status,
			message,
			timestamp: new Date().toISOString(),
		});
	}
}
