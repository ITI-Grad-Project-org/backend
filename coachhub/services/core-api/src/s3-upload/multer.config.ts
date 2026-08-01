import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp|pdf)$/i;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const fileUploadMulterOptions: MulterOptions = {
	storage: memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE_BYTES },
	fileFilter: (_req, file, callback) => {
		if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
			return callback(
				new BadRequestException(
					'Only image (jpg, png, gif, webp) and PDF files are allowed',
				),
				false,
			);
		}
		callback(null, true);
	},
};
