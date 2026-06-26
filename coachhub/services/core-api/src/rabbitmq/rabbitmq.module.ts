import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

// TODO: register publishers/consumers once event contracts are defined
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_CLIENT',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('rabbitmq.url')],
            queue: 'coachhub_main',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class RabbitmqModule {}
