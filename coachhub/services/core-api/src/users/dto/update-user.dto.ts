import { PartialType } from '@nestjs/swagger';
import { RegisterDto } from './register-user.dto';

export class UpdateUserDto extends PartialType( RegisterDto ) {}
