import twilio from 'twilio';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, encryptNullable } from '../utils/encryption';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

function getMasterClient(): twilio.Twilio {
  return twilio(
    process.env.TWILIO_MASTER_ACCOUNT_SID!,
    process.env.TWILIO_MASTER_AUTH_TOKEN!
  );
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
 */
export async function searchNearbyNumbers(
  areaCode: string,
  country = 'US'
): Promise<Array<{ phoneNumber: string; friendlyName: string }>> {
  const client = getMasterClient();
  const nearNumber = `+1${areaCode}5550000`;

  let numbers = await client.availablePhoneNumbers(country).local.list({
    nearNumber,
    distance: 50,
    smsEnabled: true,
    voiceEnabled: true,
    limit: 10,
  });

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
 * Provisions a phone number on a tenant sub-account with SMS/voice webhooks.
 */
export async function provisionPhoneNumber(
  tenantId: string,
  subAccountSid: string,
  encryptedAuthToken: string,
  phoneNumber: string,
  baseUrl: string
): Promise<string> {
  const authToken = decrypt(encryptedAuthToken);
  const subClient = twilio(subAccountSid, authToken);

  const purchased = await subClient.incomingPhoneNumbers.create({
    phoneNumber,
    smsUrl: `${baseUrl}/webhooks/twilio/sms-reply`,
    smsMethod: 'POST',
    statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
    statusCallbackMethod: 'POST',
    voiceUrl: `${baseUrl}/webhooks/twilio/voice`,
    voiceMethod: 'POST',
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { twilioPhoneNumber: purchased.phoneNumber },
  });

  logger.info('Phone number provisioned', { tenantId, phoneNumber: purchased.phoneNumber });
  return purchased.phoneNumber;
}

/**
 * Sends an SMS from the tenant's Twilio number.
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

  if (!tenant?.twilioSubAccountSid || !tenant.twilioAuthToken || !tenant.twilioPhoneNumber) {
    throw new Error(`Tenant ${tenantId} has no Twilio configuration`);
  }

  const authToken = decrypt(tenant.twilioAuthToken);
  const client = twilio(tenant.twilioSubAccountSid, authToken);

  const message = await client.messages.create({
    to: toPhone,
    from: tenant.twilioPhoneNumber,
    body,
  });

  logger.debug('SMS sent', { tenantId, messageSid: message.sid });
  return message.sid;
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
