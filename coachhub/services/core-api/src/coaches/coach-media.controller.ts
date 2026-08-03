import {
	Body,
	Controller,
	Delete,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	UploadedFile,
	UploadedFiles,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CoachesService } from './coaches.service';
import { AddCertificationDto } from './dto/add-certification.dto';
import { RemoveTransformationPhotoDto } from './dto/remove-transformation-photo.dto';
import { CurrentUser } from '../auth';
import { fileUploadMulterOptions } from '../s3-upload/multer.config';

const SINGLE_FILE_BODY = (field: string) => ({
	type: 'object' as const,
	properties: { [field]: { type: 'string', format: 'binary' } },
	required: [field],
});

@ApiTags('Coach Media')
@ApiBearerAuth()
@Controller('coaches/me')
export class CoachMediaController {
	constructor(private readonly coachesService: CoachesService) {}

	@Put('avatar')
	@ApiOperation({ summary: 'Set or replace my profile photo' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ schema: SINGLE_FILE_BODY('avatar') })
	@ApiResponse({ status: 200, description: 'Avatar updated' })
	@UseInterceptors(FileInterceptor('avatar', fileUploadMulterOptions))
	setAvatar(
		@CurrentUser('userId') coachId: string,
		@UploadedFile() avatar: Express.Multer.File,
	) {
		return this.coachesService.setAvatar(coachId, avatar);
	}

	@Delete('avatar')
	@ApiOperation({ summary: 'Remove my profile photo' })
	@ApiResponse({ status: 200, description: 'Avatar removed' })
	removeAvatar(@CurrentUser('userId') coachId: string) {
		return this.coachesService.removeAvatar(coachId);
	}

	@Post('transformation-photos')
	@ApiOperation({ summary: 'Add one or more transformation photos' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				photos: {
					type: 'array',
					items: { type: 'string', format: 'binary' },
				},
			},
			required: ['photos'],
		},
	})
	@ApiResponse({ status: 201, description: 'Photos added' })
	@UseInterceptors(FilesInterceptor('photos', 20, fileUploadMulterOptions))
	addTransformationPhotos(
		@CurrentUser('userId') coachId: string,
		@UploadedFiles() photos: Express.Multer.File[] = [],
	) {
		return this.coachesService.addTransformationPhotos(coachId, photos);
	}

	@Delete('transformation-photos')
	@ApiOperation({ summary: 'Remove a transformation photo by its URL' })
	@ApiResponse({ status: 200, description: 'Photo removed' })
	@ApiResponse({ status: 404, description: 'Photo not found on this profile' })
	removeTransformationPhoto(
		@CurrentUser('userId') coachId: string,
		@Query() query: RemoveTransformationPhotoDto,
	) {
		return this.coachesService.removeTransformationPhoto(coachId, query.url);
	}

	@Post('certifications')
	@ApiOperation({ summary: 'Add a certificate (metadata + file)' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				name: { type: 'string', example: 'NASM CPT' },
				issuer: { type: 'string', example: 'NASM' },
				issueDate: { type: 'string', format: 'date', example: '2022-05-01' },
				expiryDate: { type: 'string', format: 'date', example: '2026-05-01' },
				credentialUrl: {
					type: 'string',
					example: 'https://nasm.org/verify/123',
				},
				file: { type: 'string', format: 'binary' },
			},
			required: ['name', 'file'],
		},
	})
	@ApiResponse({ status: 201, description: 'Certificate added' })
	@UseInterceptors(FileInterceptor('file', fileUploadMulterOptions))
	addCertification(
		@CurrentUser('userId') coachId: string,
		@Body() dto: AddCertificationDto,
		@UploadedFile() file: Express.Multer.File,
	) {
		return this.coachesService.addCertification(coachId, dto, file);
	}

	@Delete('certifications/:certificationId')
	@ApiOperation({ summary: 'Remove a certificate by its id' })
	@ApiResponse({ status: 200, description: 'Certificate removed' })
	@ApiResponse({ status: 404, description: 'Certification not found' })
	removeCertification(
		@CurrentUser('userId') coachId: string,
		@Param('certificationId', ParseUUIDPipe) certificationId: string,
	) {
		return this.coachesService.removeCertification(coachId, certificationId);
	}
}
