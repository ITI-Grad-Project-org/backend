import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService, ImageDimensions } from '../config';

import * as AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';
// sharp's CJS entry is `module.exports = sharp`, so require() returns the callable
// factory directly. Using require (cast to the typed default export) avoids relying
// on esModuleInterop/__importDefault, which the dev compiler wasn't applying.
const sharp = require('sharp') as typeof import('sharp').default;

export interface UploadResult {
	url: string;
	key: string;
}

const MIME_TO_EXT: Record<string, string> = {
	'application/pdf': 'pdf',
	'image/jpeg': 'jpg',
	'image/png': 'png',
};

@Injectable()
export class S3UploadService {
	private readonly s3: AWS.S3;

	constructor(private readonly configService: ConfigService) {
		const { region, accessKeyId, secretAccessKey } =
			this.configService.awsConfig;
		this.s3 = new AWS.S3({ region, accessKeyId, secretAccessKey });
	}

	async uploadImage(
		file: Express.Multer.File,
		type: 'coach' | 'client',
	): Promise<UploadResult> {
		const imageConfig = this.configService.imageTypes[type];

		this.validateMimeType(file, imageConfig);

		const optimizedBuffer = await this.optimizeImage(file.buffer, imageConfig);
		const key = this.generateKey(imageConfig.path, file.originalname);

		await this.uploadToS3(key, optimizedBuffer, 'image/webp');

		return {
			url: `${this.configService.awsConfig.s3.baseUrl}/${key}`,
			key,
		};
	}

	async uploadImages(
		files: Express.Multer.File[],
		type: 'coach' | 'client',
	): Promise<UploadResult[]> {
		return Promise.all(files.map((file) => this.uploadImage(file, type)));
	}

	async deleteImage(key: string): Promise<void> {
		const { bucket } = this.configService.awsConfig.s3;

		await this.s3
			.deleteObject({ Bucket: bucket, Key: key })
			.promise()
			.catch((err) => {
				throw new InternalServerErrorException(
					`Failed to delete image: ${err.message}`,
				);
			});
	}

	/**
	 * Delete an object given its full URL. No-op if the URL is empty or does not
	 * belong to this bucket (e.g. an external Google avatar). Best-effort: never
	 * throws, so callers can clear a reference even if the object is already
	 * gone.
	 */
	async deleteByUrl(url?: string | null): Promise<void> {
		if (!url) return;
		const prefix = `${this.configService.awsConfig.s3.baseUrl}/`;
		if (!url.startsWith(prefix)) return;
		const key = url.slice(prefix.length);
		if (!key) return;
		await this.deleteImage(key).catch(() => undefined);
	}

	async deleteImages(keys: string[]): Promise<void> {
		if (keys.length === 0) return;

		const { bucket } = this.configService.awsConfig.s3;

		await this.s3
			.deleteObjects({
				Bucket: bucket,
				Delete: { Objects: keys.map((Key) => ({ Key })) },
			})
			.promise()
			.catch((err) => {
				throw new InternalServerErrorException(
					`Failed to delete images: ${err.message}`,
				);
			});
	}

	private validateMimeType(
		file: Express.Multer.File,
		config: ImageDimensions,
	): void {
		if (!config.allowedMimeTypes.includes(file.mimetype)) {
			throw new BadRequestException(
				`Invalid file type. Allowed: ${config.allowedMimeTypes.join(', ')}`,
			);
		}
	}

	private async optimizeImage(
		buffer: Buffer,
		config: ImageDimensions,
	): Promise<Buffer> {
		return sharp(buffer)
			.resize(config.width, config.height, { fit: 'cover' })
			.webp({ quality: 80 })
			.toBuffer();
	}

	private generateKey(path: string, originalName: string): string {
		const ext = 'webp';
		const baseName = originalName.replace(/\.[^/.]+$/, '');
		const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
		return `${path}/${uuid()}-${safeName}.${ext}`;
	}

	private generateDocumentKey(
		path: string,
		originalName: string,
		ext: string,
	): string {
		const baseName = originalName.replace(/\.[^/.]+$/, '');
		const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
		return `${path}/${uuid()}-${safeName}.${ext}`;
	}

	private async uploadToS3(
		key: string,
		buffer: Buffer,
		contentType: string,
	): Promise<void> {
		const { bucket } = this.configService.awsConfig.s3;

		await this.s3
			.upload({
				Bucket: bucket,
				Key: key,
				Body: buffer,
				ContentType: contentType,
			})
			.promise()
			.catch((err) => {
				throw new InternalServerErrorException(
					`Failed to upload image: ${err.message}`,
				);
			});
	}
}
