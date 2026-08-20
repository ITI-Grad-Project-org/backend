import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant, CurrentUser, Public } from '../auth';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymobTransaction } from './paymob.service';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
	constructor(private readonly billingService: BillingService) {}

	@Get('plans')
	@ApiOperation({ summary: 'List the available CoachHub subscription plans' })
	getPlans() {
		return this.billingService.getPlans();
	}

	@Get('me')
	@ApiOperation({ summary: 'Get this tenant subscription and feature access' })
	getMyBilling(@CurrentTenant() tenantId: string) {
		return this.billingService.getBillingSummary(tenantId);
	}

	@Post('checkout')
	@ApiOperation({ summary: 'Create a Paymob sandbox checkout' })
	createCheckout(
		@CurrentUser('userId') coachId: string,
		@CurrentTenant() tenantId: string,
		@Body() dto: CreateCheckoutDto,
	) {
		return this.billingService.createCheckout(coachId, tenantId, dto);
	}

	@Get('payments/:id')
	@ApiOperation({ summary: 'Check one payment attempt status' })
	getPaymentAttempt(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) attemptId: string,
	) {
		return this.billingService.getPaymentAttempt(tenantId, attemptId);
	}

	@Public()
	@Post('paymob/webhook')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive Paymob transaction callbacks' })
	handlePaymobWebhook(
		@Body() body: { obj?: PaymobTransaction },
		@Query('hmac') hmac: string,
	) {
		return this.billingService.handlePaymobWebhook(body, hmac);
	}
}
