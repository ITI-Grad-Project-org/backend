import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsTimeZone,
	IsUrl,
	Length,
	Matches,
	MaxLength,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
	@ApiProperty( { example: 'Iron Temple Coaching' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 150 )
	name: string;

	@ApiProperty( { example: 'iron-temple-coaching' } )
	@IsString()
	@IsNotEmpty()
	@Matches( /^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
		message: 'slug must be lowercase alphanumeric with hyphens (e.g. iron-temple-coaching)',
	} )
	slug: string;

	@ApiPropertyOptional( { example: 'https://cdn.coachhub.app/logos/iron-temple.png' } )
	@IsOptional()
	@IsUrl()
	logoUrl?: string;

	@ApiPropertyOptional( { example: 'Africa/Cairo' } )
	@IsOptional()
	@IsTimeZone()
	timezone?: string;

	@ApiPropertyOptional( { example: 'EGP' } )
	@IsOptional()
	@Length( 3, 3 )
	currency?: string;
}
