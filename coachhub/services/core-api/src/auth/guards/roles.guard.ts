// import {
//   CanActivate,
//   ExecutionContext,
//   ForbiddenException,
//   Injectable,
//   Logger,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { ROLES_KEY } from '../decorators/role.decorator';
// import { UserRole } from '../enums';
//
// @Injectable()
// export class RolesGuard implements CanActivate {
//   private logger = new Logger(RolesGuard.name);
//   constructor(private readonly reflector: Reflector) {}
//
//   canActivate(context: ExecutionContext): boolean {
//     const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
//       ROLES_KEY,
//       [context.getHandler(), context.getClass()],
//     );
//
//     this.logger.log(
//       'required roles in RolesGuard: ' + JSON.stringify(requiredRoles),
//     );
//
//     if (!requiredRoles || requiredRoles.length === 0) {
//       return true;
//     }
//
//     const { user } = context.switchToHttp().getRequest();
//     this.logger.log('current user in RolesGuard: ' + JSON.stringify(user));
//
//     if (user.role === UserRole.OWNER) {
//       return true;
//     }
//
//     if (!user || !user.role) {
//       throw new ForbiddenException('No roles found on the request');
//     }
//
//     if (!requiredRoles.includes(user.role)) {
//       throw new ForbiddenException(
//         'You do not have permission to access this resource',
//       );
//     }
//
//     return true;
//   }
// }
