import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker that keys on the *original client* IP.
 *
 * The default ThrottlerGuard tracks by `req.ip`, which behind a reverse proxy
 * (Render, a load balancer, Cloudflare, …) resolves to the proxy's address —
 * so every client shares a single bucket.
 *
 * Resolution order (most → least trustworthy for this deployment):
 *   1. `cf-connecting-ip`  — Cloudflare's true client IP (overwritten by
 *                            Cloudflare on every request; not client-spoofable).
 *   2. `true-client-ip`    — Cloudflare Enterprise / some CDNs.
 *   3. left-most `x-forwarded-for` entry — originating client behind proxies.
 *   4. `req.ip`            — direct connections / local dev.
 */
@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req.headers ?? {};

    const cfIp = this.firstHeaderValue(headers['cf-connecting-ip']);
    if (cfIp) return cfIp;

    const trueClientIp = this.firstHeaderValue(headers['true-client-ip']);
    if (trueClientIp) return trueClientIp;

    const forwarded = this.firstHeaderValue(headers['x-forwarded-for']);
    if (forwarded) {
      // "client, proxy1, proxy2" -> "client"
      return forwarded.split(',')[0].trim();
    }

    return req.ip;
  }

  private firstHeaderValue(value: unknown): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    return undefined;
  }
}
