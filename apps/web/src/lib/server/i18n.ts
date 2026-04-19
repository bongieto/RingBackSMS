/**
 * System SMS localization. Only the fixed-copy SMS strings we ship —
 * greetings operators author go through the template system
 * (renderGreetingTemplate) and are rendered verbatim.
 *
 * Start with Spanish + Tagalog because that's what languageDetect.ts
 * in the flow engine detects automatically from inbound messages. Any
 * other language falls back to English.
 *
 * For each key, write the translation so it reads natural to a native
 * speaker ordering takeout — short, friendly, no stiff formalities.
 */

type LanguageTag = 'en' | 'es' | 'tl';

type Vars = Record<string, string | number | null | undefined>;

type Copy = {
  // Payment received, pay-after-order flow
  paymentReceivedTracker: (v: Vars) => string;
  // Payment received, payment-first flow (has pickup time)
  paymentReceivedWithPickup: (v: Vars) => string;
  // Status transition SMS
  statusConfirmedWithPrep: (v: Vars) => string;
  statusConfirmed: (v: Vars) => string;
  statusPreparing: (v: Vars) => string;
  statusReady: (v: Vars) => string;
  statusCancelled: (v: Vars) => string;
  // Refund
  refundIssued: (v: Vars) => string;
  // Review
  reviewPrompt: (v: Vars) => string;
  reviewThanksHigh: (v: Vars) => string;
  reviewThanksLow: (v: Vars) => string;
  // Payment link expired
  paymentExpired: (v: Vars) => string;
  // Generic failure
  orderProcessingFailed: (v: Vars) => string;
};

// Small helper: format "Hi {name}! " prefix if name is known and safe.
function greet(v: Vars): string {
  const name = (v.firstName ?? '').toString().trim();
  return name ? `Hi ${name}! ` : '';
}
function greetEs(v: Vars): string {
  const name = (v.firstName ?? '').toString().trim();
  return name ? `Hola ${name}! ` : '';
}
function greetTl(v: Vars): string {
  const name = (v.firstName ?? '').toString().trim();
  return name ? `Kumusta ${name}! ` : '';
}

const EN: Copy = {
  paymentReceivedTracker: (v) =>
    `${greet(v)}Payment received for order #${v.orderNumber}. Thanks! Track it: ${v.trackerUrl}`,
  paymentReceivedWithPickup: (v) =>
    `${greet(v)}Payment received! Order #${v.orderNumber} confirmed. Pickup: ${v.pickupTime}. Track: ${v.trackerUrl}`,
  statusConfirmedWithPrep: (v) =>
    `${greet(v)}${v.businessName} got your order #${v.orderNumber}. Ready in ~${v.prepMins} min. Track it: ${v.trackerUrl}`,
  statusConfirmed: (v) =>
    `${greet(v)}${v.businessName} got your order #${v.orderNumber}. Track it: ${v.trackerUrl}`,
  statusPreparing: (v) => `${greet(v)}${v.businessName} is preparing your order #${v.orderNumber} now!`,
  statusReady: (v) =>
    `${greet(v)}Your order #${v.orderNumber} from ${v.businessName} is READY for pickup! Receipt: ${v.receiptUrl}`,
  statusCancelled: (v) =>
    `${greet(v)}Sorry — your order #${v.orderNumber} from ${v.businessName} has been cancelled. Please call us if you have questions.`,
  refundIssued: (v) =>
    `A refund has been issued for order #${v.orderNumber}. It may take 5-10 days to appear on your card.`,
  reviewPrompt: (v) =>
    `How was your order from ${v.businessName}? Reply 1-5 (5 = great!).`,
  reviewThanksHigh: (v) => `Thanks for the ${v.rating}-star rating! We appreciate you.`,
  reviewThanksLow: () =>
    `Thanks for the feedback — sorry we missed the mark. Reply back if there's anything we can do.`,
  paymentExpired: () => `Your payment link has expired. Text us to start a new order.`,
  orderProcessingFailed: () => `Sorry — something went wrong processing your order. Please text us again to retry.`,
};

const ES: Copy = {
  paymentReceivedTracker: (v) =>
    `${greetEs(v)}Recibimos tu pago del pedido #${v.orderNumber}. ¡Gracias! Seguilo aquí: ${v.trackerUrl}`,
  paymentReceivedWithPickup: (v) =>
    `${greetEs(v)}¡Pago recibido! Pedido #${v.orderNumber} confirmado. Recoger: ${v.pickupTime}. Seguí: ${v.trackerUrl}`,
  statusConfirmedWithPrep: (v) =>
    `${greetEs(v)}${v.businessName} recibió tu pedido #${v.orderNumber}. Listo en ~${v.prepMins} min. Seguí: ${v.trackerUrl}`,
  statusConfirmed: (v) =>
    `${greetEs(v)}${v.businessName} recibió tu pedido #${v.orderNumber}. Seguí: ${v.trackerUrl}`,
  statusPreparing: (v) =>
    `${greetEs(v)}${v.businessName} está preparando tu pedido #${v.orderNumber} ahora.`,
  statusReady: (v) =>
    `${greetEs(v)}Tu pedido #${v.orderNumber} de ${v.businessName} YA ESTÁ LISTO para recoger. Recibo: ${v.receiptUrl}`,
  statusCancelled: (v) =>
    `${greetEs(v)}Lo sentimos — tu pedido #${v.orderNumber} de ${v.businessName} fue cancelado. Llámanos si tenés preguntas.`,
  refundIssued: (v) =>
    `Emitimos un reembolso para el pedido #${v.orderNumber}. Puede demorar 5-10 días en aparecer en tu tarjeta.`,
  reviewPrompt: (v) =>
    `¿Cómo estuvo tu pedido de ${v.businessName}? Respondé 1-5 (5 = excelente).`,
  reviewThanksHigh: (v) => `¡Gracias por tu calificación de ${v.rating} estrellas! Te lo agradecemos.`,
  reviewThanksLow: () =>
    `Gracias por el comentario — lamentamos no haber estado a la altura. Escribinos si hay algo que podamos hacer.`,
  paymentExpired: () => `Tu link de pago expiró. Escribinos para empezar un nuevo pedido.`,
  orderProcessingFailed: () =>
    `Lo sentimos — algo salió mal procesando tu pedido. Escribinos de nuevo para reintentar.`,
};

const TL: Copy = {
  paymentReceivedTracker: (v) =>
    `${greetTl(v)}Nareceive na ang bayad sa order #${v.orderNumber}. Salamat! Track: ${v.trackerUrl}`,
  paymentReceivedWithPickup: (v) =>
    `${greetTl(v)}Nareceive na ang bayad! Order #${v.orderNumber} confirmed. Pickup: ${v.pickupTime}. Track: ${v.trackerUrl}`,
  statusConfirmedWithPrep: (v) =>
    `${greetTl(v)}Natanggap ng ${v.businessName} ang order #${v.orderNumber}. Handa in ~${v.prepMins} min. Track: ${v.trackerUrl}`,
  statusConfirmed: (v) =>
    `${greetTl(v)}Natanggap ng ${v.businessName} ang order #${v.orderNumber}. Track: ${v.trackerUrl}`,
  statusPreparing: (v) =>
    `${greetTl(v)}Iniihanda na ng ${v.businessName} ang order #${v.orderNumber} mo!`,
  statusReady: (v) =>
    `${greetTl(v)}Handa na ang order #${v.orderNumber} mo sa ${v.businessName} — pwede mo nang kunin! Resibo: ${v.receiptUrl}`,
  statusCancelled: (v) =>
    `${greetTl(v)}Pasensya na — na-cancel ang order #${v.orderNumber} mo sa ${v.businessName}. Tawagan mo kami kung may tanong.`,
  refundIssued: (v) =>
    `Nabalik na namin ang bayad sa order #${v.orderNumber}. Makikita sa card mo sa loob ng 5-10 araw.`,
  reviewPrompt: (v) =>
    `Kumusta ang order mo sa ${v.businessName}? Reply ng 1-5 (5 = sobrang sarap!).`,
  reviewThanksHigh: (v) =>
    `Salamat sa ${v.rating}-star rating! Appreciate namin yan.`,
  reviewThanksLow: () =>
    `Salamat sa feedback — pasensya na kung hindi ka na-satisfy. Mag-text lang kung may kailangan.`,
  paymentExpired: () => `Nag-expire na ang payment link mo. Mag-text ka para mag-umpisa ng bagong order.`,
  orderProcessingFailed: () =>
    `Pasensya na — may nangyari sa order mo. Mag-text ka ulit para i-retry.`,
};

const BY_LANG: Record<LanguageTag, Copy> = { en: EN, es: ES, tl: TL };

export function pickLanguage(lang: string | null | undefined): LanguageTag {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  if (lower === 'tl' || lower.startsWith('tl-') || lower === 'fil') return 'tl';
  return 'en';
}

export function sms(
  key: keyof Copy,
  lang: string | null | undefined,
  vars: Vars,
): string {
  const tag = pickLanguage(lang);
  const fn = BY_LANG[tag][key];
  return fn(vars);
}
