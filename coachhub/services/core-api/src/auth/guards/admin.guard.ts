// import {
//   ExecutionContext,
//   ForbiddenException,
//   Injectable,
// } from '@nestjs/common';
// import { JwtAuthGuard } from './jwt-auth.guard';
// import { UserRole } from '../enums';
//
// @Injectable()
// export class AdminGuard extends JwtAuthGuard {
//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const isAuthenticated = (await super.canActivate(context)) as boolean;
//     if (!isAuthenticated) {
//       return false;
//     }
//
//     const { user } = context.switchToHttp().getRequest();
//     if (!user || user.role !== UserRole.Admin) {
//       throw new ForbiddenException('Admin access required');
//     }
//
//     return true;
//   }
// }
