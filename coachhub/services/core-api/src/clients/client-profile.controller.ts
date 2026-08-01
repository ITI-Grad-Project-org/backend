import {
	Body,
	Controller,
	Delete,
	Get,
	Patch,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { ClientService } from './client.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';
import { fileUploadMulterOptions } from '../s3-upload/multer.config';

// @Public() only skips the global coach-JWT guard; every route here is
// protected by the client-JWT guard instead.
@Public()
@ApiTags('Client Profile')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('clients/me')
export class ClientProfileController {
	constructor(private readonly clientService: ClientService) {}

	@Get()
	@ApiOperation({ summary: 'Get my profile' })
	getMe(@CurrentClient('clientId') clientId: string) {
		return this.clientService.findProfileById(clientId);
	}

	@Patch()
	@ApiOperation({
		summary: 'Update my profile (attach the photo as the `avatar` file part)',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				firstName: { type: 'string', example: 'Sara' },
				lastName: { type: 'string', example: 'Adel' },
				phone: { type: 'string', example: '+201000000000' },
				dateOfBirth: {
					type: 'string',
					format: 'date',
					example: '1998-04-12',
				},
				gender: {
					type: 'string',
					enum: ['male', 'female', 'other'],
					example: 'female',
				},
				heightCm: { type: 'number', example: 168.5 },
				weightKg: { type: 'number', example: 72.5 },
				avatar: { type: 'string', format: 'binary' },
			},
		},
	})
	@UseInterceptors(FileInterceptor('avatar', fileUploadMulterOptions))
	update(
		@CurrentClient('clientId') clientId: string,
		@Body() updateClientDto: UpdateClientDto,
		@UploadedFile() avatar?: Express.Multer.File,
	) {
		return this.clientService.update(clientId, updateClientDto, avatar);
	}

	@Delete()
	@ApiOperation({ summary: 'Delete my account' })
	remove(@CurrentClient('clientId') clientId: string) {
		return this.clientService.remove(clientId);
	}
}
