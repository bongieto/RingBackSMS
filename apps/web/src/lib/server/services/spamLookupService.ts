// Twilio Lookup–powered spam/robocall classifier.
//
// Why: a meaningful fraction of inbound calls to small-business lines
// are robocalls / scam IVRs. Auto-replying to those by SMS wastes the
// tenant's monthly SMS quota and (worse) puts our number in front of
// spam reporting infrastructure.
//
// What it does: classify a caller's E.164 number using Twilio's
// LineTypeIntelligence add-on. Caches the result in Redis (global,
// 30-day TTL) so a returning caller doesn't trigger a paid lookup
// every call. Returns `{ allow: true | false, reason }` so the voice
// webhook can decide whether to fire the consent SMS.
//
// Failure mode: ALWAYS allow on lookup error / missing config. We'd
// rather over-message than block legitimate customers because the
// add-on returned 503.

import twilio from 'twilio';
import { Redis } from 'ioredis';
import { buildRedisOptions } from '../redisConfig';
import { logger } from '../logger';

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CACHE_PREFIX = 'spam-lookup:';
const LOOKUP_TIMEOUT_MS = 4_000;

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(buildRedisOptions());
    redisClient.on('error', (err) =>
      logger.warn('Redis client error in spam-lookup (will retry)', { err: err.message }),
    );
  }
  return redisClient;
}

export interface SpamLookupResult {
  allow: boolean;
  reason: string;
  lineType: string | null; // 'mobile' | 'landline' | 'voip' | 'tollFree' | 'fixedVoip' | etc.
  cached: boolean;
}

interface CachedRow {
  allow: boolean;
  reason: string;
  lineType: string | null;
}

/**
 * Classify an incoming caller phone. Reads cache first; on miss, calls
 * Twilio Lookup line_type_intelligence and caches the result.
 *
 * Block rule (intentionally narrow): suppress only when the lookup
 * returns `error_code` indicating an invalid number, or when the line
 * type is `nonFixedVoip` AND no caller name resolves — that combination
 * matches the typical robocaller fingerprint without sweeping up
 * legitimate VoIP business lines (which usually have CNAM data).
 *
 * Anything else allows. We err toward delivery.
 */
export async function classifyCaller(phone: string): Promise<SpamLookupResult> {
  if (!phone || !phone.startsWith('+')) {
    return { allow: true, reason: 'non-e164', lineType: null, cached: false };
  }

  // Try cache.
  try {
    const raw = await getRedis().get(CACHE_PREFIX + phone);
    if (raw) {
      const cached = JSON.parse(raw) as CachedRow;
      return { ...cached, cached: true };
    }
  } catch (err) {
    logger.warn('Spam-lookup cache read failed', {
      phone,
      err: (err as Error).message,
    });
    // Fall through — we'll just hit Twilio.
  }

  const sid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const token = process.env.TWILIO_MASTER_AUTH_TOKEN;
  if (!sid || !token) {
    return { allow: true, reason: 'no-twilio-config', lineType: null, cached: false };
  }

  let result: CachedRow;
  try {
    const client = twilio(sid, token);
    // The lookups v2 client takes the E.164 number and a list of fields
    // to return. line_type_intelligence is a paid add-on (~$0.005/req).
    const lookup = await Promise.race([
      client.lookups.v2.phoneNumbers(phone).fetch({
        fields: 'line_type_intelligence,caller_name',
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('lookup-timeout')), LOOKUP_TIMEOUT_MS),
      ),
    ]);

    if (!lookup) {
      result = { allow: true, reason: 'lookup-null', lineType: null };
    } else {
      // The Twilio SDK exposes `valid` + `lineTypeIntelligence.type`.
      // Types are returned as snake_case strings, e.g. "nonFixedVoip".
      const valid = lookup.valid;
      const lineType: string | null = lookup.lineTypeIntelligence?.type ?? null;
      const callerName: string | null = lookup.callerName?.callerName ?? null;

      if (!valid) {
        result = { allow: false, reason: 'invalid-e164', lineType };
      } else if (lineType === 'nonFixedVoip' && !callerName) {
        // Classic robocaller fingerprint: ephemeral VoIP, no CNAM.
        result = { allow: false, reason: 'unbranded-voip', lineType };
      } else {
        result = { allow: true, reason: 'ok', lineType };
      }
    }
  } catch (err) {
    logger.warn('Twilio Lookup failed — defaulting to allow', {
      phone,
      err: (err as Error).message,
    });
    result = { allow: true, reason: 'lookup-error', lineType: null };
  }

  // Cache on success path. We don't cache lookup-error / no-config so
  // a flapping Twilio doesn't poison the cache — just retries next call.
  if (result.reason === 'ok' || result.reason === 'invalid-e164' || result.reason === 'unbranded-voip') {
    try {
      await getRedis().setex(
        CACHE_PREFIX + phone,
        CACHE_TTL_SECONDS,
        JSON.stringify(result),
      );
    } catch (err) {
      logger.warn('Spam-lookup cache write failed', {
        phone,
        err: (err as Error).message,
      });
    }
  }

  return { ...result, cached: false };
}
