import { ApiProperty } from '@nestjs/swagger';
import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';
import { isValidDateOnly } from '../../../common';

export const CLIENT_NUTRITION_CALENDAR_MAX_DAYS = 366;

function IsDateOnly(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isDateOnly',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown) {
					return typeof value === 'string' && isValidDateOnly(value);
				},
				defaultMessage(args: ValidationArguments) {
					return `${args.property} must be a valid date in YYYY-MM-DD format`;
				},
			},
		});
	};
}

export class ClientNutritionCalendarQueryDto {
	@ApiProperty({
		example: '2026-02-01',
		format: 'date',
		description:
			'First calendar date to return, inclusive. Historical and future dates are allowed. Together with to, the range may contain at most 366 calendar days.',
	})
	@IsDateOnly()
	from: string;

	@ApiProperty({
		example: '2027-02-01',
		format: 'date',
		description:
			'Last calendar date to return, inclusive. It must be on or after from and no more than 365 days after from, producing at most 366 inclusive calendar days.',
	})
	@IsDateOnly()
	to: string;
}
