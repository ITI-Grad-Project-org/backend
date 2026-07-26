import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Invitation } from '../invitation/entities/invitation.entity';
import { InvitaionStatusEnum } from '../invitation/enums/invitaion-status.enum';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { ClientService } from '../clients/client.service';
import { ClientMembershipService } from '../clients/client-membership.service';
import { ClientIntakeService } from '../clients/client-intake.service';
import { ClientAuthService } from '../auth/services/client-auth.service';
import { MembershipStatus, OtpProvider } from '../common';
import { ConfirmOnboardingDto } from './dto/confirm-onboarding.dto';

/** What a valid code resolved to — the app shows this before asking for intake. */
export interface OnboardingCodeInfo {
	valid: true;
	/** Which flow issued the code: a coach invite, or an approved join request. */
	source: 'invitation' | 'request';
	tenantId: string;
	tenantName: string;
	coachName: string | null;
}

type ResolvedCode =
	| { kind: 'invitation'; invitation: Invitation }
	| { kind: 'membership'; membership: ClientMembership };

/**
 * A coach invite and an approved join request are, to the client, the same
 * thing: a 6-digit code that drops them into a tenant. Both are resolved here
 * against a single "enter your code" screen — invitations are matched by the
 * client's email, approved requests by their pending (`INVITED`) membership.
 */
@Injectable()
export class OnboardingService {
	private readonly logger = new Logger(OnboardingService.name);

	constructor(
		@InjectRepository(Invitation)
		private readonly invitationRepository: Repository<Invitation>,
		private readonly clientService: ClientService,
		private readonly membershipService: ClientMembershipService,
		private readonly intakeService: ClientIntakeService,
		private readonly clientAuthService: ClientAuthService,
		private readonly otpProvider: OtpProvider,
	) {}

	/** Check a code without consuming it — lets the app gate the intake screen. */
	async validate(clientId: string, code: string): Promise<OnboardingCodeInfo> {
		const resolved = await this.resolveOrThrow(clientId, code);
		return this.describe(resolved);
	}

	/** Consume the code: join the tenant (activate the membership) and, if the
	 *  onboarding screen sent it, persist intake in the same call. Returns a fresh
	 *  token pair scoped to the joined tenant. */
	async confirm(clientId: string, dto: ConfirmOnboardingDto) {
		const resolved = await this.resolveOrThrow(clientId, dto.code);

		let membership: ClientMembership;
		let tenantId: string;

		if (resolved.kind === 'invitation') {
			const { invitation } = resolved;
			tenantId = invitation.tenant.id;
			membership = await this.membershipService.createMembership(
				clientId,
				tenantId,
				MembershipStatus.ACTIVE,
			);
			// Consume the invite so the code can never be replayed.
			invitation.status = InvitaionStatusEnum.ACCEPTED;
			invitation.otpHash = null;
			invitation.receiver = { id: clientId } as Invitation['receiver'];
			await this.invitationRepository.save(invitation);
		} else {
			tenantId = resolved.membership.tenant.id;
			membership = await this.membershipService.activateInvited(
				resolved.membership,
			);
		}

		if (dto.intake) {
			await this.intakeService.createForMembership(
				membership.id,
				tenantId,
				dto.intake,
			);
		}

		this.logger.debug(
			`client ${clientId} joined tenant ${tenantId} via ${resolved.kind}`,
		);

		// The client just joined a new tenant — re-issue their tokens so the JWT
		// carries that tenant (CurrentTenant reads the tenantId claim). switchTenant
		// re-checks the now-active membership and marks the tenant active.
		return this.clientAuthService.switchTenant(clientId, tenantId);
	}

	/**
	 * Match the code against the client's pending invitations first, then their
	 * approved-but-unconfirmed memberships. Wrong codes burn a guess on every
	 * live candidate so the short code can't be brute-forced.
	 */
	private async resolveOrThrow(
		clientId: string,
		code: string,
	): Promise<ResolvedCode> {
		const invalid = new BadRequestException('Invalid or expired code');

		const client = await this.clientService.findById(clientId);
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		const invitations = await this.invitationRepository
			.createQueryBuilder('invitation')
			.addSelect(['invitation.otpHash', 'invitation.otpAttempts'])
			.leftJoinAndSelect('invitation.tenant', 'tenant')
			.leftJoinAndSelect('tenant.ownerCoach', 'ownerCoach')
			.where('LOWER(invitation.email) = LOWER(:email)', {
				email: client.email,
			})
			.andWhere('invitation.status = :status', {
				status: InvitaionStatusEnum.PENDING,
			})
			.getMany();

		const invitation = invitations.find((candidate) =>
			this.otpProvider.matches(code, candidate.otpHash),
		);
		if (invitation) {
			if (invitation.expiresAt.getTime() < Date.now()) {
				invitation.status = InvitaionStatusEnum.EXPIRED;
				await this.invitationRepository.save(invitation);
				throw invalid;
			}
			this.assertAttemptsLeft(invitation.otpAttempts);
			return { kind: 'invitation', invitation };
		}

		const memberships =
			await this.membershipService.findInvitedWithOtp(clientId);

		const membership = memberships.find((candidate) =>
			this.otpProvider.matches(code, candidate.inviteOtpHash),
		);
		if (membership) {
			if (
				membership.inviteOtpExpires &&
				membership.inviteOtpExpires.getTime() < Date.now()
			) {
				throw invalid;
			}
			this.assertAttemptsLeft(membership.inviteOtpAttempts);
			return { kind: 'membership', membership };
		}

		await this.penaliseWrongGuess(invitations, memberships);
		throw invalid;
	}

	private assertAttemptsLeft(attempts: number): void {
		if (attempts >= OtpProvider.MAX_ATTEMPTS) {
			throw new BadRequestException(
				'Too many incorrect attempts. Ask your coach to send a new code.',
			);
		}
	}

	private async penaliseWrongGuess(
		invitations: Invitation[],
		memberships: ClientMembership[],
	): Promise<void> {
		const now = Date.now();

		const inviteIds = invitations
			.filter((invitation) => invitation.expiresAt.getTime() >= now)
			.map((invitation) => invitation.id);
		if (inviteIds.length > 0) {
			await this.invitationRepository.increment(
				{ id: In(inviteIds) },
				'otpAttempts',
				1,
			);
		}

		const membershipIds = memberships
			.filter(
				(membership) =>
					!membership.inviteOtpExpires ||
					membership.inviteOtpExpires.getTime() >= now,
			)
			.map((membership) => membership.id);
		await this.membershipService.incrementInviteOtpAttempts(membershipIds);
	}

	private describe(resolved: ResolvedCode): OnboardingCodeInfo {
		const tenant =
			resolved.kind === 'invitation'
				? resolved.invitation.tenant
				: resolved.membership.tenant;
		const coach = tenant?.ownerCoach;

		return {
			valid: true,
			source: resolved.kind === 'invitation' ? 'invitation' : 'request',
			tenantId: tenant.id,
			tenantName: tenant.name,
			coachName: coach ? `${coach.firstName} ${coach.lastName}` : null,
		};
	}
}
