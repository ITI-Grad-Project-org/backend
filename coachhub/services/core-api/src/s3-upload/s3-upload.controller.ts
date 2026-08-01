import {
	Body,
	Controller,
	Delete,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	UploadedFile,
	UploadedFiles,
	UseInterceptors,
} from '@nestjs/common';
import {
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { S3UploadService, UploadResult } from './s3-upload.service';
import { UploadDocumentDto, UploadImageDto } from './dto/upload.dto';
import { Public } from '../auth';

// TODO(security): uploads are currently open to preserve the existing
// registration-time upload flow. Once upload is only used by authenticated
// coaches/clients, drop @Public() (and add a principal-aware guard if clients
// must upload too — the global guard only accepts tenant-user tokens).
@Public()
@ApiTags('Upload')
@Controller('upload')
export class S3UploadController {
	constructor(private readonly s3UploadService: S3UploadService) {}

	@Post('image')
	@ApiOperation({ summary: 'Upload a single image' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: { type: 'string', format: 'binary' },
				type: { type: 'string', enum: ['coach', 'client'] },
			},
			required: ['file', 'type'],
		},
	})
	@ApiResponse({ status: 201, description: 'Image uploaded successfully' })
	@ApiResponse({ status: 400, description: 'Invalid file or type' })
	@HttpCode(HttpStatus.CREATED)
	@UseInterceptors(FileInterceptor('file'))
	async uploadImage(
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: UploadImageDto,
	): Promise<{ success: boolean; data: UploadResult }> {
		const result = await this.s3UploadService.uploadImage(file, dto.type);
		return { success: true, data: result };
	}

	@Post('images')
	@ApiOperation({ summary: 'Upload multiple images' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				files: {
					type: 'array',
					items: { type: 'string', format: 'binary' },
				},
				type: { type: 'string', enum: ['client', 'coach'] },
			},

			required: ['files', 'type'],
		},
	})
	@ApiResponse({ status: 201, description: 'Images uploaded successfully' })
	@ApiResponse({ status: 400, description: 'Invalid files or type' })
	@HttpCode(HttpStatus.CREATED)
	@UseInterceptors(FilesInterceptor('files', 20))
	async uploadImages(
		@UploadedFiles() files: Express.Multer.File[],
		@Body() dto: UploadImageDto,
	): Promise<{ success: boolean; data: UploadResult[] }> {
		const results = await this.s3UploadService.uploadImages(files, dto.type);
		return { success: true, data: results };
	}

	@Post('document')
	@ApiOperation({ summary: 'Upload a single document (PDF or image scan)' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: { type: 'string', format: 'binary' },
				type: { type: 'string', enum: ['certificate'] },
			},
			required: ['file', 'type'],
		},
	})
	@ApiResponse({ status: 201, description: 'Document uploaded successfully' })
	@ApiResponse({ status: 400, description: 'Invalid file or type' })
	@HttpCode(HttpStatus.CREATED)
	@UseInterceptors(FileInterceptor('file'))
	async uploadDocument(
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: UploadDocumentDto,
	): Promise<{ success: boolean; data: UploadResult }> {
		const result = await this.s3UploadService.uploadDocument(file, dto.type);
		return { success: true, data: result };
	}

	@Delete(':key(*)')
	@ApiOperation({ summary: 'Delete an image by S3 key' })
	@ApiResponse({ status: 200, description: 'Image deleted successfully' })
	@HttpCode(HttpStatus.OK)
	async deleteImage(
		@Param('key') key: string,
	): Promise<{ success: boolean; message: string }> {
		await this.s3UploadService.deleteImage(key);
		return { success: true, message: 'Image deleted successfully' };
	}
}
