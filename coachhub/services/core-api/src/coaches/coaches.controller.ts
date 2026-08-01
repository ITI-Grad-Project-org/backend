import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	UploadedFiles,
	UseInterceptors,
	ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CoachesService } from './coaches.service';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { CurrentUser } from '../auth';
import { fileUploadMulterOptions } from '../s3-upload/multer.config';

// Validates the parsed `data` blob exactly as the global pipe would a JSON body.
const dataFieldPipe = new ValidationPipe({
	whitelist: true,
	forbidNonWhitelisted: true,
	transform: true,
});

type CoachProfileUpload = {
	avatar?: Express.Multer.File[];
	transformationPhotos?: Express.Multer.File[];
	certificateFiles?: Express.Multer.File[];
};

// Pre-filled into Swagger's `data` field so the whole shape — including the
// certifications metadata that certificate files attach to — is discoverable.
const COACH_PROFILE_DATA_EXAMPLE = JSON.stringify(
	{
		firstName: 'Jane',
		lastName: 'Smith',
		phone: '+201000000000',
		age: 32,
		gender: 'female',
		location: 'Lisbon, PT',
		specialties: ['strength', 'hypertrophy'],
		yearsExperience: 8,
		careerExperience:
			'Head coach at Iron Temple; trained national-level lifters.',
		certifications: [
			{
				name: 'NASM CPT',
				issuer: 'NASM',
				issueDate: '2022-05-01',
				expiryDate: '2026-05-01',
				credentialUrl: 'https://nasm.org/verify/123',
			},
		],
		portfolioUrl: 'https://janesmith.coach',
		featuredReviews: '"Lost 12kg in 5 months" — Sara A.',
		bio: 'A paragraph that makes a client want to work with you.',
		offlineAvailability: 'hybrid',
		availabilityHours: 'Mon–Fri · 7 AM – 7 PM',
		priceFrom: 120,
		priceTo: 320,
	},
	null,
	2,
);

@ApiTags('Coaches')
@ApiBearerAuth()
@Controller('coaches')
export class CoachesController {
	constructor(private readonly coachesService: CoachesService) {}

	@Get('me')
	@ApiOperation({ summary: 'Get my profile' })
	getMe(@CurrentUser('userId') coachId: string) {
		return this.coachesService.findOne(coachId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a coach by id (must be yourself)' })
	findOne(
		@CurrentUser('userId') coachId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		this.assertSelf(coachId, id);
		return this.coachesService.findOne(id);
	}

	@Patch('me')
	@ApiOperation({
		summary: 'Update my profile',
		description:
			'multipart/form-data. Send profile fields as a JSON string in `data`. ' +
			'Attach the photo as `avatar`, gallery shots as `transformationPhotos`, ' +
			'and certificate PDFs as `certificateFiles` (matched by order to ' +
			'`data.certifications`).',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				data: {
					type: 'string',
					description:
						'JSON-encoded profile fields (UpdateCoachDto). All fields ' +
						'optional. To attach certificate files, include a ' +
						'`certifications` array here — the i-th `certificateFiles` entry ' +
						'fills the i-th certification’s file.',
					example: COACH_PROFILE_DATA_EXAMPLE,
				},
				avatar: { type: 'string', format: 'binary' },
				transformationPhotos: {
					type: 'array',
					items: { type: 'string', format: 'binary' },
				},
				certificateFiles: {
					type: 'array',
					items: { type: 'string', format: 'binary' },
				},
			},
		},
	})
	@UseInterceptors(
		FileFieldsInterceptor(
			[
				{ name: 'avatar', maxCount: 1 },
				{ name: 'transformationPhotos', maxCount: 20 },
				{ name: 'certificateFiles', maxCount: 20 },
			],
			fileUploadMulterOptions,
		),
	)
	async update(
		@CurrentUser('userId') coachId: string,
		@Body('data') data: string | undefined,
		@UploadedFiles() files: CoachProfileUpload = {},
	) {
		const dto = await this.parseProfileData(data);
		return this.coachesService.update(coachId, dto, {
			avatar: files.avatar?.[0],
			transformationPhotos: files.transformationPhotos ?? [],
			certificateFiles: files.certificateFiles ?? [],
		});
	}

	/** Parses and validates the JSON `data` part against UpdateCoachDto. */
	private async parseProfileData(raw?: string): Promise<UpdateCoachDto> {
		if (!raw) return {};
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new BadRequestException('`data` must be a valid JSON string');
		}
		return dataFieldPipe.transform(parsed, {
			type: 'body',
			metatype: UpdateCoachDto,
		});
	}

	@Delete('me')
	@ApiOperation({ summary: 'Delete my account' })
	remove(@CurrentUser('userId') coachId: string) {
		return this.coachesService.remove(coachId);
	}

	private assertSelf(coachId: string, targetId: string) {
		if (coachId !== targetId) {
			throw new ForbiddenException('You can only access your own account');
		}
	}
}
