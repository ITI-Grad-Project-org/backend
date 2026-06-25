import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import {
	TenantService
} from './tenant.service';
import {
	CreateTenantDto
} from './dto/create-tenant.dto';
import {
	JwtAuthGuard,
	Public
} from '../auth';
import {
	CurrentTenant
} from '../auth/decorators/current-tenant.decorator';

@ApiTags( 'Tenants' )
@Controller( 'tenant' )
export class TenantController {
	constructor ( private readonly tenantService: TenantService ) {}

	@Public()
	@Post()
	@ApiOperation( { summary: 'Create a new tenant' } )
	@ApiResponse( { status: 201, description: 'Tenant created successfully' } )
	@ApiResponse( { status: 400, description: 'Validation error or slug taken' } )
	@HttpCode( HttpStatus.CREATED )
	create ( @Body() createTenantDto: CreateTenantDto ) {
		return this.tenantService.create( createTenantDto );
	}

	@Get( 'me' )
	@UseGuards( JwtAuthGuard )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Get the current authenticated user\'s tenant' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findMine ( @CurrentTenant() tenantId: number ) {
		return this.tenantService.findOne( tenantId );
	}

	@Get( ':id' )
	@ApiOperation( { summary: 'Get a tenant by ID' } )
	@ApiParam( { name: 'id', description: 'Tenant MongoDB ID' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findOne ( @Param( 'id', ParseIntPipe ) id: number ) {
		return this.tenantService.findOne( id );
	}

	@Get( 'slug/:slug' )
	@ApiOperation( { summary: 'Get a tenant by slug' } )
	@ApiParam( { name: 'slug', description: 'Tenant slug' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findBySlug ( @Param( 'slug' ) slug: string ) {
		return this.tenantService.findBySlug( slug );
	}

}
