import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { Invitation } from './entities/invitation.entity';
import { InvitaionStatusEnum } from './enums/invitaion-status.enum';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { EventType } from '../messaging/events';
import { CoachesService } from '../coaches/coaches.service';
import { OtpProvider } from '../common';

const INVITATION_TTL_DAYS = 7;

/**
 * Coach-facing invitation management. Clients accept the emailed code through
 * the shared `client/me/onboarding` flow, not here.
 */
@Injectable()
export class InvitationService {
	private readonly logger = new Logger(InvitationService.name);

	constructor(
		@InjectRepository(Invitation)
		private readonly invitationRepository: Repository<Invitation>,
		private readonly eventPublisherService: EventPublisherService,
		private readonly coachesService: CoachesService,
		private readonly otpProvider: OtpProvider,
	) {}

	async create(
		coachId: string,
		tenantId: string,
		createInvitationDto: CreateInvitationDto,
	): Promise<Invitation> {
		const email = createInvitationDto.email.trim().toLowerCase();

		const existing = await this.invitationRepository.findOne({
			where: {
				email,
				tenant: { id: tenantId },
				status: InvitaionStatusEnum.PENDING,
			},
		});
		if (existing) {
			throw new BadRequestException(
				'A pending invitation already exists for this email',
			);
		}

		const coach = await this.coachesService.findOne(coachId);
		if (!coach) {
			throw new NotFoundException('Inviting coach not found');
		}

		const otp = this.otpProvider.generateOtp();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

		const invitation = this.invitationRepository.create({
			email,
			clientName: createInvitationDto.name ?? null,
			status: InvitaionStatusEnum.PENDING,
			token: randomUUID(),
			otpHash: this.otpProvider.hash(otp),
			expiresAt,
			sender: { id: coachId },
			tenant: { id: tenantId },
		});
		const saved = await this.invitationRepository.save(invitation);

		await this.eventPublisherService.publish(
			EventType.CLIENT_INVITED,
			{
				inviteId: saved.id,
				coachId: coachId,
				coachName: `${coach.firstName} ${coach.lastName}`,
				clientEmail: email,
				clientName: saved.clientName,
				otp,
				expiresAt: expiresAt.toISOString(),
			},
			{ tenantId },
		);

		this.logger.debug(
			`invitation ${saved.id} created for ${email} in tenant ${tenantId}`,
		);

		return saved;
	}

	findAll(tenantId: string): Promise<Invitation[]> {
		return this.invitationRepository.find({
			where: { tenant: { id: tenantId } },
			order: { created_at: 'DESC' },
		});
	}

	findOne(tenantId: string, id: string): Promise<Invitation | null> {
		return this.invitationRepository.findOne({
			where: { id, tenant: { id: tenantId } },
		});
	}

	async revoke(tenantId: string, id: string): Promise<Invitation> {
		const invitation = await this.findOne(tenantId, id);
		if (!invitation) {
			throw new NotFoundException('Invitation not found');
		}
		if (invitation.status !== InvitaionStatusEnum.PENDING) {
			throw new BadRequestException('Only pending invitations can be revoked');
		}

		invitation.status = InvitaionStatusEnum.REVOKED;
		return this.invitationRepository.save(invitation);
	}
}
