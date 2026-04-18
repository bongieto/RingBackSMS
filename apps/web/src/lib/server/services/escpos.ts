/**
 * Minimal ESC/POS formatter for kitchen receipts on a Star thermal printer
 * (TSP143/TM-m30). Star printers speak the StarPRNT subset but also
 * accept the overlap with standard ESC/POS commands we use here.
 *
 * Layout aims for 48-char wide columns (80mm paper at font A). Keep lines
 * short enough that we don't wrap unexpectedly, which looks bad on the
 * ticket.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function bytes(...arr: (number | number[] | Uint8Array)[]): Uint8Array {
  const flat: number[] = [];
  for (const a of arr) {
    if (typeof a === 'number') flat.push(a);
    else if (a instanceof Uint8Array) flat.push(...Array.from(a));
    else flat.push(...a);
  }
  return new Uint8Array(flat);
}

function textBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

const INIT = bytes(ESC, 0x40);                 // initialize
const ALIGN_CENTER = bytes(ESC, 0x61, 0x01);
const ALIGN_LEFT = bytes(ESC, 0x61, 0x00);
const BOLD_ON = bytes(ESC, 0x45, 0x01);
const BOLD_OFF = bytes(ESC, 0x45, 0x00);
const DOUBLE_ON = bytes(GS, 0x21, 0x11);       // 2x width/height
const DOUBLE_OFF = bytes(GS, 0x21, 0x00);
const FEED_AND_CUT = bytes(LF, LF, LF, LF, LF, GS, 0x56, 0x42, 0x00); // feed + partial cut

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function line(s: string): Uint8Array {
  return bytes(...textBytes(s), LF);
}

function hr(char = '-'): Uint8Array {
  return line(char.repeat(42));
}

export interface ReceiptInput {
  businessName: string;
  orderNumber: string;
  customerName?: string | null;
  callerPhone: string;
  items: Array<{
    name: string;
    quantity: number;
    selectedModifiers?: Array<{ groupName: string; modifierName: string }>;
    notes?: string | null;
    personName?: string | null;
  }>;
  pickupTime?: string | null;
  notes?: string | null;
  total?: number;
  createdAt: Date;
}

/** Render a kitchen ticket for an Order to ESC/POS bytes. */
export function renderOrderTicket(input: ReceiptInput): Uint8Array {
  const parts: Uint8Array[] = [INIT];

  parts.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON, line(input.businessName));
  parts.push(DOUBLE_OFF, BOLD_OFF);
  parts.push(line(input.createdAt.toLocaleString('en-US')));
  parts.push(ALIGN_LEFT);
  parts.push(hr());

  parts.push(BOLD_ON, DOUBLE_ON, line(`#${input.orderNumber}`));
  parts.push(DOUBLE_OFF, BOLD_OFF);
  if (input.customerName) parts.push(line(`Name: ${input.customerName}`));
  parts.push(line(`Phone: ${input.callerPhone}`));
  if (input.pickupTime) parts.push(line(`Pickup: ${input.pickupTime}`));
  parts.push(hr());

  // Group-order printing: if any line carries a personName, emit a
  // sub-header per person so prep staff can bag separately. Untagged
  // lines land in a default "ORDER" bucket.
  const byPerson = new Map<string, typeof input.items>();
  for (const item of input.items) {
    const key = item.personName?.trim() || '';
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key)!.push(item);
  }
  const hasMultiplePeople = byPerson.size > 1 || (byPerson.size === 1 && Array.from(byPerson.keys())[0] !== '');
  for (const [person, items] of byPerson) {
    if (hasMultiplePeople) {
      parts.push(hr('-'));
      parts.push(ALIGN_CENTER, BOLD_ON, line(person || 'ORDER'), BOLD_OFF, ALIGN_LEFT);
    }
    for (const item of items) {
      parts.push(BOLD_ON, line(`${item.quantity}x ${item.name}`), BOLD_OFF);
      if (item.selectedModifiers?.length) {
        for (const m of item.selectedModifiers) {
          parts.push(line(`   - ${m.groupName}: ${m.modifierName}`));
        }
      }
      if (item.notes) parts.push(line(`   ! ${item.notes}`));
    }
  }

  if (input.notes) {
    parts.push(hr());
    parts.push(BOLD_ON, line('NOTES:'), BOLD_OFF);
    parts.push(line(input.notes));
  }

  if (input.total != null) {
    parts.push(hr());
    parts.push(ALIGN_CENTER, BOLD_ON, line(`TOTAL $${input.total.toFixed(2)}`), BOLD_OFF);
  }

  parts.push(FEED_AND_CUT);
  return concat(parts);
}
