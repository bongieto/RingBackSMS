import twilio from 'twilio';
import { encrypt, decrypt, encryptNullable, decryptNullable } from '../encryption';
import { logger } from '../logger';
import { prisma } from '../db';

function getMasterClient(): twilio.Twilio {
  return twilio(
    process.env.TWILIO_MASTER_ACCOUNT_SID!,
    process.env.TWILIO_MASTER_AUTH_TOKEN!
  );
}

function getMessagingServiceSid(): string {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid) {
    throw new Error(
      'TWILIO_MESSAGING_SERVICE_SID is not set — required to attach numbers to the A2P 10DLC campaign'
    );
  }
  return sid;
}

/**
 * Returns the correct Twilio auth token to use for webhook signature
 * validation for a given tenant. Master-owned tenants (no sub-account)
 * use the master auth token; legacy sub-account tenants use their own.
 */
export function getValidationToken(tenant: {
  twilioSubAccountSid: string | null;
  twilioAuthToken: string | null;
}): string | null {
  if (tenant.twilioSubAccountSid) {
    return decryptNullable(tenant.twilioAuthToken);
  }
  return process.env.TWILIO_MASTER_AUTH_TOKEN ?? null;
}

/**
 * Provisions a new Twilio sub-account for a tenant.
 * Returns the sub-account SID and auth token (unencrypted — store encrypted).
 */
export async function provisionSubAccount(
  tenantName: string
): Promise<{ accountSid: string; authToken: string }> {
  const client = getMasterClient();

  const subAccount = await client.api.v2010.accounts.create({
    friendlyName: `RingBack - ${tenantName}`,
  });

  return {
    accountSid: subAccount.sid,
    authToken: subAccount.authToken,
  };
}

/**
 * Searches available phone numbers in a given area code.
 */
export async function searchAvailableNumbers(
  areaCode: string,
  country = 'US'
): Promise<Array<{ phoneNumber: string; friendlyName: string }>> {
  const client = getMasterClient();

  const numbers = await client.availablePhoneNumbers(country).local.list({
    areaCode: parseInt(areaCode, 10),
    smsEnabled: true,
    voiceEnabled: true,
    limit: 10,
  });

  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
  }));
}

/**
 * Searches for nearby available numbers when the requested area code is exhausted.
 * Uses a synthetic number from the area code to find geographically close alternatives.
 */
export async function searchNearbyNumbers(
  areaCode: string,
  country = 'US'
): Promise<Array<{ phoneNumber: string; friendlyName: string }>> {
  const client = getMasterClient();
  const nearNumber = `+1${areaCode}5550000`;

  // Try 50-mile radius first
  let numbers = await client.availablePhoneNumbers(country).local.list({
    nearNumber,
    distance: 50,
    smsEnabled: true,
    voiceEnabled: true,
    limit: 10,
  });

  // Widen to 100 miles if nothing found
  if (numbers.length === 0) {
    numbers = await client.availablePhoneNumbers(country).local.list({
      nearNumber,
      distance: 100,
      smsEnabled: true,
      voiceEnabled: true,
      limit: 10,
    });
  }

  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
  }));
}

/**
 * Provisions a phone number on the Twilio MASTER account and attaches it
 * to the A2P 10DLC Messaging Service so outbound SMS goes through the
 * registered campaign sender pool. Each tenant still gets its own
 * dedicated number — the difference vs. legacy is account ownership.
 */
export async function provisionPhoneNumber(
  tenantId: string,
  phoneNumber: string,
  baseUrl: string
): Promise<string> {
  const messagingServiceSid = getMessagingServiceSid();
  const master = getMasterClient();

  const purchased = await master.incomingPhoneNumbers.create({
    phoneNumber,
    smsUrl: `${baseUrl}/api/webhooks/twilio/sms-reply`,
    smsMethod: 'POST',
    statusCallback: `${baseUrl}/api/webhooks/twilio/call-status`,
    statusCallbackMethod: 'POST',
    voiceUrl: `${baseUrl}/api/webhooks/twilio/voice`,
    voiceMethod: 'POST',
  });

  // Attach to the A2P campaign sender pool
  try {
    await master.messaging.v1.services(messagingServiceSid).phoneNumbers.create({
      phoneNumberSid: purchased.sid,
    });
  } catch (err) {
    logger.error('Failed to attach number to Messaging Service', {
      tenantId,
      phoneNumberSid: purchased.sid,
      err,
    });
    throw err;
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      twilioPhoneNumber: purchased.phoneNumber,
      twilioPhoneNumberSid: purchased.sid,
    },
  });

  logger.info('Phone number provisioned on master + attached to MG', {
    tenantId,
    phoneNumber: purchased.phoneNumber,
    messagingServiceSid,
  });
  return purchased.phoneNumber;
}

/**
 * Sends an SMS from the tenant's Twilio number.
 *
 * Branched on `twilioSubAccountSid`:
 *  - Legacy (sub-account present): use sub-account client + `from`
 *  - New (master-owned): use master client + `messagingServiceSid` + `from`.
 *    Passing both lets sticky-sender route through the A2P campaign while
 *    preserving the tenant's dedicated number.
 */
export async function sendSms(
  tenantId: string,
  toPhone: string,
  body: string
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      twilioSubAccountSid: true,
      twilioAuthToken: true,
      twilioPhoneNumber: true,
    },
  });

  if (!tenant?.twilioPhoneNumber) {
    // Runtime guard: never let Twilio pick a random pool number, which
    // would cause SMS to be sent under the wrong tenant's identity.
    throw new Error(`Tenant ${tenantId} has no provisioned Twilio phone number`);
  }

  // Legacy sub-account path — left untouched for backward compatibility.
  if (tenant.twilioSubAccountSid && tenant.twilioAuthToken) {
    const authToken = decrypt(tenant.twilioAuthToken);
    const client = twilio(tenant.twilioSubAccountSid, authToken);
    const message = await client.messages.create({
      to: toPhone,
      from: tenant.twilioPhoneNumber,
      body,
    });
    logger.debug('SMS sent (legacy sub-account)', { tenantId, messageSid: message.sid });
    return message.sid;
  }

  // New master-account + Messaging Service path
  const messagingServiceSid = getMessagingServiceSid();
  const master = getMasterClient();
  const message = await master.messages.create({
    to: toPhone,
    from: tenant.twilioPhoneNumber,
    messagingServiceSid,
    body,
  });
  logger.debug('SMS sent (master + MG)', { tenantId, messageSid: message.sid });
  return message.sid;
}

/**
 * Fire-and-forget SMS with up to `maxRetries` attempts on transient failure.
 * Used by the voice webhook where we can't `await` before returning TwiML.
 */
export async function sendSmsWithRetry(
  tenantId: string,
  toPhone: string,
  body: string,
  maxRetries = 2,
  delayMs = 2000,
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendSms(tenantId, toPhone, body);
      return true;
    } catch (err) {
      if (attempt < maxRetries) {
        logger.warn('[sendSmsWithRetry] attempt failed, retrying', {
          tenantId,
          attempt: attempt + 1,
          maxRetries,
          error: (err as Error).message,
        });
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        logger.error('[sendSmsWithRetry] all attempts failed', {
          tenantId,
          error: (err as Error).message,
        });
      }
    }
  }
  return false;
}

/**
 * Stores Twilio sub-account credentials encrypted on the tenant record.
 */
export async function saveTenantTwilioCredentials(
  tenantId: string,
  accountSid: string,
  authToken: string
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      twilioSubAccountSid: accountSid,
      twilioAuthToken: encrypt(authToken),
    },
  });
}
