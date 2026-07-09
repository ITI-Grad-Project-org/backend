import { PartialType } from '@nestjs/swagger';
import { CreateClientIntakeDto } from './create-client-intake.dto';

export class UpdateClientIntakeDto extends PartialType(CreateClientIntakeDto) {}
