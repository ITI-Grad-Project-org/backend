import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Post,
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
	CurrentTenant
} from '../auth/decorators/current-tenant.decorator';

@ApiTags( 'Tenants' )
@Controller( 'tenant' )
export class TenantController {
	constructor ( private readonly tenantService: TenantService ) {}

	@Post()
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Create a new tenant' } )
	@ApiResponse( { status: 201, description: 'Tenant created successfully' } )
	@ApiResponse( { status: 400, description: 'Validation error or slug taken' } )
	@HttpCode( HttpStatus.CREATED )
	create ( @Body() createTenantDto: CreateTenantDto ) {
		return this.tenantService.create( createTenantDto );
	}

	@Get( 'me' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Get the current authenticated user\'s tenant' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findMine ( @CurrentTenant() tenantId: number ) {
		return this.tenantService.findOne( tenantId );
	}

	@Get( ':id' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Get a tenant by ID (must be your own tenant)' } )
	@ApiParam( { name: 'id', description: 'Tenant ID' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 403, description: 'Not your tenant' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findOne (
		@CurrentTenant() tenantId: number,
		@Param( 'id', ParseIntPipe ) id: number,
	) {
		// A user only ever has their own tenant; block cross-tenant reads.
		if ( id !== Number( tenantId ) ) {
			throw new ForbiddenException( 'You can only access your own tenant' );
		}
		return this.tenantService.findOne( id );
	}

	@Get( 'slug/:slug' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Get a tenant by slug' } )
	@ApiParam( { name: 'slug', description: 'Tenant slug' } )
	@ApiResponse( { status: 200, description: 'Tenant retrieved successfully' } )
	@ApiResponse( { status: 404, description: 'Tenant not found' } )
	@HttpCode( HttpStatus.OK )
	findBySlug ( @Param( 'slug' ) slug: string ) {
		return this.tenantService.findBySlug( slug );
	}

}
