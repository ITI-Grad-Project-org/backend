import { JwtPayload } from 'jsonwebtoken';

export interface AuthPayload extends JwtPayload {
	userId: string;
	email: string;
	tenantId: string;
	type: 'tenant-user';
}
