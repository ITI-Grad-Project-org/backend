import {
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ClientMembershipService } from '../clients/client-membership.service';
import { ClientService } from '../clients/client.service';
import { ConfigService } from '../config';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { EventType } from '../messaging/events';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { OtpProvider } from '../common';
import { EntitlementService } from '../billing/entitlement.service';

/** Approval codes live as long as coach invites — a week to open the app. */
const APPROVAL_OTP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Client-initiated mirror of the invitation flow: instead of a coach emailing a
 * token, a signed-in client picks a coach from the directory and asks to join.
 * The request *is* the membership row, in `REQUESTED` state, so approval is a
 * status flip rather than a second table to reconcile.
 */
@Injectable()
export class JoinRequestService {
	private readonly logger = new Logger(JoinRequestService.name);

	constructor(
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
		private readonly membershipService: ClientMembershipService,
		private readonly clientService: ClientService,
		private readonly eventPublisherService: EventPublisherService,
		private readonly configService: ConfigService,
		private readonly otpProvider: OtpProvider,
		private readonly entitlementService: EntitlementService,
	) {}

	private buildUrl(path: string): string {
		const baseUrl = this.configService.appConfig.frontendUrl.replace(
			/\/+$/,
			'',
		);
		return `${baseUrl}${path}`;
	}

	async request(clientId: string, dto: CreateJoinRequestDto) {
		const tenant = await this.tenantRepository.findOne({
			where: { id: dto.tenantId },
			relations: { ownerCoach: true },
		});

		if (!tenant) {
			throw new NotFoundException('Coach not found');
		}
		if (!tenant.acceptingClients) {
			throw new ForbiddenException(
				'This coach is not accepting new clients right now',
			);
		}

		const client = await this.clientService.findById(clientId);
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		const membership = await this.membershipService.requestToJoin(
			clientId,
			tenant.id,
			dto.message ?? null,
		);

		await this.eventPublisherService.publish(
			EventType.CLIENT_REQUESTED,
			{
				membershipId: membership.id,
				clientId: client.id,
				clientName: `${client.firstName} ${client.lastName}`,
				clientEmail: client.email,
				coachId: tenant.ownerCoach.id,
				coachEmail: tenant.ownerCoach.email,
				coachName: `${tenant.ownerCoach.firstName} ${tenant.ownerCoach.lastName}`,
				tenantName: tenant.name,
				message: membership.requestMessage,
				requestsUrl: this.buildUrl('/coach/requests'),
			},
			{ tenantId: tenant.id },
		);

		this.logger.debug(
			`client ${clientId} requested to join tenant ${tenant.id}`,
		);

		return membership;
	}

	listForClient(clientId: string) {
		return this.membershipService.findClientRequests(clientId);
	}

	withdraw(clientId: string, membershipId: string) {
		return this.membershipService.withdrawRequest(clientId, membershipId);
	}

	listForTenant(tenantId: string) {
		return this.membershipService.findTenantRequests(tenantId);
	}

	async decide(tenantId: string, membershipId: string, approved: boolean) {
		const membership = await this.membershipService.findPendingRequest(
			tenantId,
			membershipId,
		);
		const tenant = await this.tenantRepository.findOne({
			where: { id: tenantId },
			relations: { ownerCoach: true },
		});

		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}

		const client = membership.client;
		if (!client) {
			throw new NotFoundException('Requesting client no longer exists');
		}

		// On approval the membership stays `INVITED` holding a code; the client
		// activates it by entering that code via `confirm`. Rejection is terminal.
		let otp: string | null = null;
		let decided;
		if (approved) {
			await this.entitlementService.assertCanAddActiveClient(tenantId);
			otp = this.otpProvider.generateOtp();
			decided = await this.membershipService.approveWithOtp(
				membership,
				this.otpProvider.hash(otp),
				this.otpProvider.expiryFromNow(APPROVAL_OTP_TTL_MS),
			);
		} else {
			decided = await this.membershipService.rejectRequest(membership);
		}

		await this.eventPublisherService.publish(
			approved
				? EventType.CLIENT_REQUEST_APPROVED
				: EventType.CLIENT_REQUEST_REJECTED,
			{
				membershipId: decided.id,
				clientId: client.id,
				clientEmail: client.email,
				clientName: `${client.firstName} ${client.lastName}`,
				coachId: tenant.ownerCoach.id,
				coachName: `${tenant.ownerCoach.firstName} ${tenant.ownerCoach.lastName}`,
				tenantName: tenant.name,
				otp,
				actionUrl: this.buildUrl(approved ? '/client/onboarding' : '/coaches'),
			},
			{ tenantId },
		);

		this.logger.debug(
			`request ${membershipId} ${approved ? 'approved' : 'rejected'} in tenant ${tenantId}`,
		);

		return decided;
	}
}
