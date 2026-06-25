import { JwtPayload } from 'jsonwebtoken';

export interface ClientAuthPayload extends JwtPayload {
	clientId: string;
	email: string;
	tenantId: string | null;
	type: 'client';
}
