import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './entities/client.entity';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const client = this.clientRepository.create(createClientDto);
    return this.clientRepository.save(client);
  }

  findAll() {
    return this.clientRepository.find();
  }

  findOne(id: number) {
    return this.clientRepository.findOne({
      where: { id },
      relations: { memberships: { tenant: true } },
    });
  }

  findOneByEmail(email: string) {
    return this.clientRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        googleId: true,
        profilePicture: true,
      },
    });
  }

  findByGoogleId(googleId: string) {
    return this.clientRepository.findOne({
      where: { googleId },
      select: {
        id: true,
        email: true,
        name: true,
        googleId: true,
        profilePicture: true,
      },
    });
  }

  findById(id: number) {
    return this.clientRepository.findOne({ where: { id } });
  }

  findByIdWithRefreshToken(id: number) {
    return this.clientRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        hashedRefreshToken: true,
      },
    });
  }

  findProfileById(id: number) {
    return this.clientRepository.findOne({
      where: { id },
      relations: { memberships: { tenant: true } },
    });
  }

  async findByValidResetToken(hashedToken: string) {
    return this.clientRepository
      .createQueryBuilder('client')
      .addSelect('client.resetPasswordToken')
      .addSelect('client.resetPasswordExpires')
      .where('client.resetPasswordToken = :token', { token: hashedToken })
      .andWhere('client.resetPasswordExpires > :now', { now: new Date() })
      .getOne();
  }

  updateRefreshToken(id: number, hashedRefreshToken: string | null) {
    return this.clientRepository.update(id, { hashedRefreshToken });
  }

  updateLastLoginAt(id: number) {
    return this.clientRepository.update(id, { lastLoginAt: new Date() });
  }

  updateGoogleInfo(
    id: number,
    data: { googleId: string; profilePicture?: string },
  ) {
    return this.clientRepository.update(id, data);
  }

  setResetPasswordToken(id: number, token: string, expires: Date) {
    return this.clientRepository.update(id, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  resetClientPassword(id: number, hashedPassword: string) {
    return this.clientRepository.update(id, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      hashedRefreshToken: null,
    });
  }

  logout(id: number) {
    return this.clientRepository.update(id, { hashedRefreshToken: null });
  }

  update(id: number, updateClientDto: UpdateClientDto) {
    return this.clientRepository.update(id, updateClientDto);
  }

  remove(id: number) {
    return this.clientRepository.softDelete(id);
  }

  async updateClientProfile(
    clientId: number,
    body: UpdateClientDto,
  ): Promise<Client | null> {
    // 1 :check if the user exists
    const clientResult = await this.findById(clientId);
    // 2 : assign the new body object to the client object

    if (!clientResult) {
      return null;
    }

    Object.assign(clientResult, body);

    return this.clientRepository.save(clientResult);
  }
}
