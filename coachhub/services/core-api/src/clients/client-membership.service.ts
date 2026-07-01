import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStatus } from '../auth';
import { UpdateClientMembershipProfileDto } from './dto/update-client-membership-profile.dto';
import { ClientMembership } from './entities/client-membership.entity';

@Injectable()
export class ClientMembershipService {
  constructor(
    @InjectRepository(ClientMembership)
    private readonly membershipRepository: Repository<ClientMembership>,
  ) {}

  /**
   * Every tenant the client is linked to, regardless of status, ordered by
   * most recently active. Used to render the "switch tenant" picker.
   */
  findMemberships(clientId: number): Promise<ClientMembership[]> {
    return this.membershipRepository.find({
      where: { client: { id: clientId } },
      relations: { tenant: true },
      order: { lastActiveAt: 'DESC', invitedAt: 'DESC' },
    });
  }

  findMembership(
    clientId: number,
    tenantId: number,
  ): Promise<ClientMembership | null> {
    return this.membershipRepository.findOne({
      where: { client: { id: clientId }, tenant: { id: tenantId } },
      relations: { tenant: true },
    });
  }

  /**
   * Every client linked to a tenant, with the client identity loaded. This is
   * the tenant-scoped "my clients" list a coach sees — it can only ever return
   * clients that belong to the caller's own tenant.
   */
  findTenantMembers(tenantId: number): Promise<ClientMembership[]> {
    return this.membershipRepository.find({
      where: { tenant: { id: tenantId } },
      relations: { client: true },
      order: { invitedAt: 'DESC' },
    });
  }

  /**
   * A single client's membership within a tenant, with the client identity
   * loaded. Returns `null` when the client is not a member of that tenant,
   * which callers translate into a 404 so tenants cannot probe each other.
   */
  findTenantMember(
    tenantId: number,
    clientId: number,
  ): Promise<ClientMembership | null> {
    return this.membershipRepository.findOne({
      where: { tenant: { id: tenantId }, client: { id: clientId } },
      relations: { client: true },
    });
  }

  /** Removes a client from a single tenant without touching other tenants. */
  removeFromTenant(membershipId: number) {
    return this.membershipRepository.softDelete(membershipId);
  }

  async updateClientOwnTenantProfile(
    clientId: number,
    tenantId: number,
    dto: UpdateClientMembershipProfileDto,
  ): Promise<ClientMembership | null> {
    const membership = await this.findMembership(clientId, tenantId);
    if (!membership) {
      return null;
    }

    Object.assign(membership, dto);
    return this.membershipRepository.save(membership);
  }

  /**
   * The tenant a freshly-authenticated client should land in: the most
   * recently active membership that is currently active. Returns `null` when
   * the client has no usable membership yet (e.g. only pending invitations).
   */
  async resolveDefaultTenantId(clientId: number): Promise<number | null> {
    const membership = await this.membershipRepository.findOne({
      where: { client: { id: clientId }, status: UserStatus.ACTIVE },
      relations: { tenant: true },
      order: { lastActiveAt: 'DESC', invitedAt: 'DESC' },
    });

    return membership?.tenant?.id ?? null;
  }

  /**
   * Links a client to a tenant. Used when seeding and, later, when an
   * invitation is accepted. Defaults to PENDING so an invite must be accepted
   * before the client can switch into the tenant.
   */
  async createMembership(
    clientId: number,
    tenantId: number,
    status: UserStatus = UserStatus.PENDING,
  ): Promise<ClientMembership> {
    const existing = await this.findMembership(clientId, tenantId);
    if (existing) {
      throw new BadRequestException(
        'Client is already a member of this tenant',
      );
    }

    const membership = this.membershipRepository.create({
      client: { id: clientId },
      tenant: { id: tenantId },
      status,
      joinedAt: status === UserStatus.ACTIVE ? new Date() : null,
    });
    return this.membershipRepository.save(membership);
  }

  markActiveNow(membershipId: number) {
    return this.membershipRepository.update(membershipId, {
      lastActiveAt: new Date(),
    });
  }
}
