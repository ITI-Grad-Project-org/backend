import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

export class CreateCheckoutDto {
	@ApiProperty({ enum: [SubscriptionPlan.SOLO, SubscriptionPlan.STUDIO] })
	@IsIn([SubscriptionPlan.SOLO, SubscriptionPlan.STUDIO], {
		message: 'plan must be either solo or studio',
	})
	plan: SubscriptionPlan.SOLO | SubscriptionPlan.STUDIO;
}
