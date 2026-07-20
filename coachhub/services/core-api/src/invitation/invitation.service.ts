import {
	BadRequestException,
	ForbiddenException,
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
import { ConfigService } from '../config';
import { CoachesService } from '../coaches/coaches.service';
import { ClientService } from '../clients/client.service';
import { ClientMembershipService } from '../clients/client-membership.service';
import { ClientIntakeService } from '../clients/client-intake.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { MembershipStatus } from '../common';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class InvitationService {
	private readonly logger = new Logger(InvitationService.name);

	constructor(
		@InjectRepository(Invitation)
		private readonly invitationRepository: Repository<Invitation>,
		private readonly eventPublisherService: EventPublisherService,
		private readonly configService: ConfigService,
		private readonly coachesService: CoachesService,
		private readonly clientService: ClientService,
		private readonly membershipService: ClientMembershipService,
		private readonly intakeService: ClientIntakeService,
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

		const token = randomUUID();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

		const invitation = this.invitationRepository.create({
			email,
			clientName: createInvitationDto.name ?? null,
			status: InvitaionStatusEnum.PENDING,
			token,
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
				inviteToken: token,
				acceptUrl: this.buildAcceptUrl(token),
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

	async findByToken(token: string): Promise<Invitation> {
		const invitation = await this.invitationRepository.findOne({
			where: { token },
			relations: { tenant: true, sender: true },
		});
		if (!invitation) {
			throw new NotFoundException('Invitation not found');
		}
		return invitation;
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

	async accept(
		clientId: string,
		token: string,
		dto: AcceptInvitationDto = {},
	): Promise<Invitation> {
		const invitation = await this.invitationRepository.findOne({
			where: { token },
			relations: { tenant: true },
		});
		if (!invitation) {
			throw new NotFoundException('Invitation not found');
		}

		if (invitation.status !== InvitaionStatusEnum.PENDING) {
			throw new BadRequestException('This invitation is no longer pending');
		}

		if (invitation.expiresAt.getTime() < Date.now()) {
			invitation.status = InvitaionStatusEnum.EXPIRED;
			await this.invitationRepository.save(invitation);
			throw new BadRequestException('This invitation has expired');
		}

		const client = await this.clientService.findById(clientId);
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		if (client.email.toLowerCase() !== invitation.email.toLowerCase()) {
			throw new ForbiddenException(
				'This invitation was sent to a different email address',
			);
		}

		const membership = await this.membershipService.createMembership(
			clientId,
			invitation.tenant.id,
			MembershipStatus.ACTIVE,
		);

		if (dto.intake) {
			await this.intakeService.createForMembership(
				membership.id,
				invitation.tenant.id,
				dto.intake,
			);
		}

		invitation.status = InvitaionStatusEnum.ACCEPTED;
		invitation.receiver = { id: clientId } as any;
		return this.invitationRepository.save(invitation);
	}

	private buildAcceptUrl(token: string): string {
		const baseUrl = this.configService.appConfig.frontendUrl.replace(
			/\/+$/,
			'',
		);
		return `${baseUrl}/invitations/accept?token=${token}`;
	}
}
