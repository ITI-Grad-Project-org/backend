import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Generic 6-digit OTP mechanics shared by the onboarding flows (coach invites
 * and approved join requests). The password-reset flow has its own copy in
 * `auth/providers/password-reset-otp.provider.ts` with reset-specific TTLs; this
 * one stays deliberately un-opinionated about lifetimes so each caller supplies
 * its own expiry.
 *
 * A 6-digit code is only ~1M possibilities, so it is guessable. Two things keep
 * it safe here, and both matter:
 *   1. codes are looked up per-account (never "find any row with this OTP"),
 *   2. wrong guesses are counted and the code dies at MAX_ATTEMPTS.
 */
@Injectable()
export class OtpProvider {
	/** Wrong guesses allowed before the code is burned and must be re-issued. */
	static readonly MAX_ATTEMPTS = 5;

	/** Cryptographically random 6-digit code, zero-padded ("004821" is valid). */
	generateOtp(): string {
		return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
	}

	/** Only ever store the hash — a leaked DB must not reveal live codes. */
	hash(value: string): string {
		return crypto.createHash('sha256').update(value).digest('hex');
	}

	/**
	 * Constant-time hash comparison. Both inputs are fixed-length sha256 hex, so a
	 * length mismatch means "not equal" rather than a malformed input.
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

	expiryFromNow(ms: number): Date {
		return new Date(Date.now() + ms);
	}
}
