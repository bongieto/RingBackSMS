/**
 * System SMS copy. English only.
 *
 * History: this module used to ship Spanish and Tagalog translations
 * keyed off Contact.preferredLanguage. We dropped foreign-language
 * support — the flow engine now replies in English only and intercepts
 * clearly non-English inbound messages with a fixed apology (see
 * flowEngineService.ts). The `lang` argument is retained for
 * compatibility with existing call sites; it is ignored.
 *
 * If foreign-language support is ever reintroduced, revert to the
 * branched BY_LANG table — git history has the ES/TL copy.
 */

type Vars = Record<string, string | number | null | undefined>;

type CopyKey =
  | 'paymentReceivedTracker'
  | 'paymentReceivedWithPickup'
  | 'statusConfirmedWithPrep'
  | 'statusConfirmed'
  | 'statusPreparing'
  | 'statusReady'
  | 'statusCancelled'
  | 'refundIssued'
  | 'reviewPrompt'
  | 'reviewThanksHigh'
  | 'reviewThanksLow'
  | 'paymentExpired'
  | 'orderProcessingFailed'
  | 'meetingConfirmPrompt'
  | 'meetingConfirmThanks'
  | 'meetingRescheduleAck';

// Small helper: format "Hi {name}! " prefix if name is known and safe.
function greet(v: Vars): string {
  const name = (v.firstName ?? '').toString().trim();
  return name ? `Hi ${name}! ` : '';
}

const COPY: Record<CopyKey, (v: Vars) => string> = {
  paymentReceivedTracker: (v) =>
    `${greet(v)}Payment received for order #${v.orderNumber}. Thanks! Track it: ${v.trackerUrl}`,
  paymentReceivedWithPickup: (v) =>
    `${greet(v)}Payment received! Order #${v.orderNumber} confirmed. Pickup: ${v.pickupTime}. Track: ${v.trackerUrl}`,
  statusConfirmedWithPrep: (v) =>
    `${greet(v)}${v.businessName} got your order #${v.orderNumber}. Ready in ~${v.prepMins} min. Track it: ${v.trackerUrl}`,
  statusConfirmed: (v) =>
    `${greet(v)}${v.businessName} got your order #${v.orderNumber}. Track it: ${v.trackerUrl}`,
  statusPreparing: (v) =>
    `${greet(v)}${v.businessName} is preparing your order #${v.orderNumber} now!`,
  statusReady: (v) =>
    `${greet(v)}Your order #${v.orderNumber} from ${v.businessName} is READY for pickup! Receipt: ${v.receiptUrl}`,
  statusCancelled: (v) =>
    `${greet(v)}Sorry — your order #${v.orderNumber} from ${v.businessName} has been cancelled. Please call us if you have questions.`,
  refundIssued: (v) =>
    `A refund has been issued for order #${v.orderNumber}. It may take 5-10 days to appear on your card.`,
  reviewPrompt: (v) =>
    `How was your order from ${v.businessName}? Reply 1-5 (5 = great!).`,
  reviewThanksHigh: (v) =>
    v.reviewUrl
      ? `Thanks for the ${v.rating}-star rating! Mind sharing it on Google? ${v.reviewUrl}`
      : `Thanks for the ${v.rating}-star rating! We appreciate you.`,
  reviewThanksLow: () =>
    `Thanks for the feedback — sorry we missed the mark. Reply back if there's anything we can do.`,
  paymentExpired: () =>
    `Your payment link has expired. Text us to start a new order.`,
  orderProcessingFailed: () =>
    `Sorry — something went wrong processing your order. Please text us again to retry.`,
  meetingConfirmPrompt: (v) =>
    `Reminder: your appointment with ${v.businessName} is ${v.timeLabel}. Reply C to confirm or R to reschedule.`,
  meetingConfirmThanks: (v) =>
    `Got it — see you ${v.timeLabel}!`,
  meetingRescheduleAck: () =>
    `No problem — what day works better for you?`,
};

export function pickLanguage(_lang: string | null | undefined): 'en' {
  return 'en';
}

export function sms(
  key: CopyKey,
  _lang: string | null | undefined,
  vars: Vars,
): string {
  return COPY[key](vars);
}
