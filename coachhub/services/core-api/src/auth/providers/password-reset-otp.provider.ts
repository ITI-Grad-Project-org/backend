import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Shared OTP mechanics for the coach and client password-reset flows.
 *
 * A 6-digit code is only ~1M possibilities, so — unlike the 32-byte link token
 * it replaces — it is guessable. Three things keep it safe, and all three matter:
 *   1. codes are looked up per-account (never "find any user with this OTP"),
 *   2. wrong guesses are counted and the code dies at MAX_ATTEMPTS,
 *   3. the window is short (OTP_TTL_MS).
 */
@Injectable()
export class PasswordResetOtpProvider {
	/** Codes expire quickly — long enough to switch to a mail app, no longer. */
	static readonly OTP_TTL_MS = 10 * 60 * 1000;

	/** Wrong guesses allowed before the code is burned and must be re-requested. */
	static readonly MAX_ATTEMPTS = 5;

	/** Stage-2 ticket lifetime: just enough to type a new password. */
	static readonly TICKET_TTL_MS = 10 * 60 * 1000;

	/** Cryptographically random 6-digit code, zero-padded ("004821" is valid). */
	generateOtp(): string {
		return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
	}

	/** Opaque single-use ticket returned after the OTP verifies. */
	generateTicket(): string {
		return crypto.randomBytes(32).toString('hex');
	}

	/** Only ever store the hash — a leaked DB must not reveal live codes. */
	hash(value: string): string {
		return crypto.createHash('sha256').update(value).digest('hex');
	}

	/**
	 * Constant-time hash comparison. Both inputs are fixed-length sha256 hex,
	 * so a length mismatch means "not equal" rather than a malformed input.
	 */
	matches(candidate: string, storedHash: string | null): boolean {
		if (!storedHash) {
			return false;
		}
		const a = Buffer.from(this.hash(candidate), 'utf8');
		const b = Buffer.from(storedHash, 'utf8');
		if (a.length !== b.length) {
			return false;
		}
		return crypto.timingSafeEqual(a, b);
	}

	otpExpiry(): Date {
		return new Date(Date.now() + PasswordResetOtpProvider.OTP_TTL_MS);
	}

	ticketExpiry(): Date {
		return new Date(Date.now() + PasswordResetOtpProvider.TICKET_TTL_MS);
	}

	/** Minutes value quoted to the user in the email body. */
	get ttlMinutes(): number {
		return PasswordResetOtpProvider.OTP_TTL_MS / 60_000;
	}
}
