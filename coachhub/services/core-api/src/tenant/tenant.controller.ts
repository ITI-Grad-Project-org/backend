import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { fileUploadMulterOptions } from '../s3-upload/multer.config';

@ApiTags('Tenants')
@Controller('tenant')
export class TenantController {
	constructor(private readonly tenantService: TenantService) {}

	@Post()
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Create a new tenant' })
	@ApiResponse({ status: 201, description: 'Tenant created successfully' })
	@ApiResponse({ status: 400, description: 'Validation error or slug taken' })
	@HttpCode(HttpStatus.CREATED)
	create(@Body() createTenantDto: CreateTenantDto) {
		return this.tenantService.create(createTenantDto);
	}

	@Patch('me/logo')
	@ApiBearerAuth()
	@ApiOperation({ summary: "Upload/replace my tenant's brand logo" })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: { logo: { type: 'string', format: 'binary' } },
			required: ['logo'],
		},
	})
	@ApiResponse({ status: 200, description: 'Logo updated' })
	@ApiResponse({ status: 400, description: 'Invalid file' })
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(FileInterceptor('logo', fileUploadMulterOptions))
	updateLogo(
		@CurrentTenant() tenantId: string,
		@UploadedFile() logo: Express.Multer.File,
	) {
		return this.tenantService.updateLogo(tenantId, logo);
	}

	@Get('me')
	@ApiBearerAuth()
	@ApiOperation({ summary: "Get the current authenticated user's tenant" })
	@ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
	@ApiResponse({ status: 404, description: 'Tenant not found' })
	@HttpCode(HttpStatus.OK)
	findMine(@CurrentTenant() tenantId: string) {
		return this.tenantService.findOne(tenantId);
	}

	@Get(':id')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Get a tenant by ID (must be your own tenant)' })
	@ApiParam({ name: 'id', description: 'Tenant ID' })
	@ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
	@ApiResponse({ status: 403, description: 'Not your tenant' })
	@ApiResponse({ status: 404, description: 'Tenant not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		// A coach only ever has their own tenant; block cross-tenant reads.
		if (id !== tenantId) {
			throw new ForbiddenException('You can only access your own tenant');
		}
		return this.tenantService.findOne(id);
	}

	@Get('slug/:slug')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Get a tenant by slug' })
	@ApiParam({ name: 'slug', description: 'Tenant slug' })
	@ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
	@ApiResponse({ status: 404, description: 'Tenant not found' })
	@HttpCode(HttpStatus.OK)
	findBySlug(@Param('slug') slug: string) {
		return this.tenantService.findBySlug(slug);
	}
}
