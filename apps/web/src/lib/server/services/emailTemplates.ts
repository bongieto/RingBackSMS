import { Plan } from '@ringback/shared-types';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com';

const BRAND_COLOR = '#2563eb';
const LIGHT_BG = '#f8fafc';
const BORDER_COLOR = '#e2e8f0';

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${LIGHT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:white;border-radius:12px;border:1px solid ${BORDER_COLOR};overflow:hidden;">
      <div style="background:${BRAND_COLOR};padding:24px 32px;">
        <h1 style="margin:0;color:white;font-size:20px;font-weight:600;">RingbackSMS</h1>
      </div>
      <div style="padding:32px;">
        ${content}
      </div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">
      RingbackSMS &mdash; Never miss a customer again<br>
      <a href="${DASHBOARD_URL}" style="color:#94a3b8;">Dashboard</a>
    </p>
  </div>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:8px 0;">${text}</a>`;
}

function stepList(steps: Array<{ title: string; description: string }>): string {
  return steps.map((s, i) => `
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex-shrink:0;width:28px;height:28px;background:${BRAND_COLOR};color:white;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:600;">${i + 1}</div>
      <div>
        <strong style="color:#1a1a1a;font-size:15px;">${s.title}</strong>
        <p style="color:#64748b;font-size:14px;margin:4px 0 0;">${s.description}</p>
      </div>
    </div>
  `).join('');
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Welcome — sent when subscription becomes active
// ────────────────────────────────────────────────────────────────────────────

export function welcomeEmail(businessName: string, plan: Plan): { subject: string; html: string } {
  const planLabel = plan.charAt(0) + plan.slice(1).toLowerCase();

  return {
    subject: `Welcome to RingbackSMS — Let's get you set up!`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">Welcome, ${businessName}!</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Your <strong>${planLabel}</strong> plan is now active. Here's how to get the most out of RingbackSMS:
      </p>

      ${stepList([
        {
          title: 'Set up your RingbackSMS phone number',
          description: 'Go to Settings &rarr; Phone to provision your dedicated RingbackSMS number. This is the number that will catch missed calls and auto-reply via SMS.',
        },
        {
          title: 'Forward your business phone to RingbackSMS',
          description: 'Set up call forwarding on your existing business phone so unanswered calls go to your RingbackSMS number. On most phones: dial <strong>*67*[your RingbackSMS number]#</strong> or set "Forward when unanswered" in your phone settings. This way customers keep calling your normal number &mdash; RingbackSMS picks up when you can\'t.',
        },
        {
          title: 'Customize your greeting',
          description: 'Edit the auto-response message your callers receive. Use Settings &rarr; General to craft a greeting that matches your brand.',
        },
        {
          title: 'Configure business hours',
          description: 'Set per-day hours and holidays so the AI knows when you\'re open. After-hours callers get a note about your next open time.',
        },
        {
          title: 'Connect your POS (optional)',
          description: 'Link Square, Shopify, or Clover in Settings &rarr; Integrations so customers can place orders via text.',
        },
        {
          title: 'Tune the AI personality',
          description: 'Describe your brand voice in Settings &rarr; General under "AI Personality" — the assistant will match your tone in every reply.',
        },
      ])}

      <div style="text-align:center;margin-top:28px;">
        ${button('Go to Dashboard', `${DASHBOARD_URL}/dashboard`)}
      </div>

      <p style="color:#94a3b8;font-size:13px;margin-top:28px;">
        Need help? Reply to this email or visit our dashboard — we're happy to assist.
      </p>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Subscription Cancelled
// ────────────────────────────────────────────────────────────────────────────

export function subscriptionCancelledEmail(businessName: string): { subject: string; html: string } {
  return {
    subject: `Your RingbackSMS subscription has been cancelled`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">We're sorry to see you go, ${businessName}</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;">
        Your subscription has been cancelled. Here's what happens next:
      </p>
      <ul style="color:#64748b;font-size:14px;line-height:1.8;padding-left:20px;">
        <li>Your account has been downgraded to the <strong>Starter</strong> (free) plan</li>
        <li>Existing conversations and data are preserved</li>
        <li>Advanced features (POS integration, custom flows) are paused</li>
        <li>You can resubscribe anytime from the Billing page</li>
      </ul>

      <div style="text-align:center;margin-top:24px;">
        ${button('Resubscribe', `${DASHBOARD_URL}/dashboard/billing`)}
      </div>

      <p style="color:#94a3b8;font-size:13px;margin-top:28px;">
        If this was a mistake, or if there's something we could have done better, just reply to this email.
      </p>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Payment Failed
// ────────────────────────────────────────────────────────────────────────────

export function paymentFailedEmail(businessName: string): { subject: string; html: string } {
  return {
    subject: `Action required: Payment failed for RingbackSMS`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">Payment issue, ${businessName}</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;">
        We weren't able to process your latest payment. Your service will continue for now, but please update your payment method to avoid interruption.
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="color:#991b1b;font-size:14px;margin:0;">
          <strong>What to do:</strong> Click below to open the billing portal and update your card.
        </p>
      </div>

      <div style="text-align:center;margin-top:24px;">
        ${button('Update Payment Method', `${DASHBOARD_URL}/dashboard/billing`)}
      </div>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Usage Limit Warning (approaching SMS cap)
// ────────────────────────────────────────────────────────────────────────────

export function usageLimitWarningEmail(
  businessName: string,
  usedCount: number,
  limitCount: number
): { subject: string; html: string } {
  const pct = Math.round((usedCount / limitCount) * 100);

  return {
    subject: `You've used ${pct}% of your SMS messages this month`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">SMS usage update</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;">
        Hi ${businessName}, you've sent <strong>${usedCount.toLocaleString()}</strong> of your <strong>${limitCount.toLocaleString()}</strong> included messages this billing cycle (${pct}%).
      </p>

      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px;margin:20px 0;">
        <div style="background:#e2e8f0;border-radius:4px;height:12px;overflow:hidden;">
          <div style="background:${pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : BRAND_COLOR};height:100%;width:${Math.min(pct, 100)}%;border-radius:4px;"></div>
        </div>
        <p style="color:#64748b;font-size:13px;margin:8px 0 0;text-align:center;">
          ${usedCount.toLocaleString()} / ${limitCount.toLocaleString()} messages
        </p>
      </div>

      <p style="color:#64748b;font-size:14px;line-height:1.6;">
        After your included messages, additional SMS will be billed at the metered rate on your plan. You can upgrade for a higher allowance.
      </p>

      <div style="text-align:center;margin-top:24px;">
        ${button('View Usage & Upgrade', `${DASHBOARD_URL}/dashboard/billing`)}
      </div>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Weekly Missed Call Digest
// ────────────────────────────────────────────────────────────────────────────

export function weeklyDigestEmail(
  businessName: string,
  stats: {
    missedCalls: number;
    conversations: number;
    orders: number;
    meetings: number;
    revenue: number;
  }
): { subject: string; html: string } {
  const statRow = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};">${label}</td>
      <td style="padding:8px 16px;color:#1a1a1a;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid ${BORDER_COLOR};">${value}</td>
    </tr>`;

  return {
    subject: `Your weekly RingbackSMS summary — ${stats.missedCalls} missed calls handled`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">Weekly Summary</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi ${businessName}, here's how RingbackSMS worked for you this past week:
      </p>

      <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER_COLOR};border-radius:8px;overflow:hidden;">
        ${statRow('Missed Calls Handled', String(stats.missedCalls))}
        ${statRow('SMS Conversations', String(stats.conversations))}
        ${statRow('Orders Placed', String(stats.orders))}
        ${statRow('Meetings Booked', String(stats.meetings))}
        ${statRow('Revenue Generated', `$${stats.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
      </table>

      <div style="text-align:center;margin-top:28px;">
        ${button('View Full Analytics', `${DASHBOARD_URL}/dashboard/analytics`)}
      </div>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Meeting Confirmation — sent when a meeting is confirmed
// ────────────────────────────────────────────────────────────────────────────

export function meetingConfirmationEmail(
  businessName: string,
  meeting: { callerPhone: string; scheduledAt: string; notes?: string | null }
): { subject: string; html: string } {
  const date = new Date(meeting.scheduledAt);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    subject: `Meeting Confirmed — ${dateStr} at ${timeStr}`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">Meeting Confirmed</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Hi ${businessName}, a meeting has been confirmed.
      </p>

      <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER_COLOR};border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};width:120px;">Date</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};">Time</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${timeStr}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};">Customer</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${meeting.callerPhone}</td>
        </tr>
        ${meeting.notes ? `
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;">Notes</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;">${meeting.notes}</td>
        </tr>` : ''}
      </table>

      <div style="text-align:center;margin-top:28px;">
        ${button('View Meetings', `${DASHBOARD_URL}/dashboard/meetings`)}
      </div>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Meeting Request — sent when a new meeting is created with a scheduled date
// ────────────────────────────────────────────────────────────────────────────

export function meetingRequestEmail(
  businessName: string,
  meeting: { callerPhone: string; scheduledAt: string; notes?: string | null }
): { subject: string; html: string } {
  const date = new Date(meeting.scheduledAt);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    subject: `New Meeting Request — ${meeting.callerPhone} on ${dateStr}`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">New Meeting Request</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Hi ${businessName}, a customer has requested a meeting.
      </p>

      <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER_COLOR};border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};width:120px;">Customer</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${meeting.callerPhone}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};">Preferred Date</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;border-bottom:1px solid ${BORDER_COLOR};">Preferred Time</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${timeStr}</td>
        </tr>
        ${meeting.notes ? `
        <tr>
          <td style="padding:12px 16px;color:#64748b;font-size:14px;">Notes</td>
          <td style="padding:12px 16px;color:#1a1a1a;font-size:14px;">${meeting.notes}</td>
        </tr>` : ''}
      </table>

      <p style="color:#64748b;font-size:14px;line-height:1.6;margin:20px 0 0;">
        Review and confirm or reschedule this meeting in your dashboard.
      </p>

      <div style="text-align:center;margin-top:28px;">
        ${button('View Meeting', `${DASHBOARD_URL}/dashboard/meetings`)}
      </div>
    `),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Daily Task Digest — sent once a day with open action items
// ────────────────────────────────────────────────────────────────────────────

export function dailyTaskDigestEmail(
  businessName: string,
  tasks: Array<{
    id: string;
    title: string;
    priority: 'URGENT' | 'HIGH' | 'NORMAL';
    source: string;
    callerPhone?: string | null;
    createdAt: Date | string;
  }>
): { subject: string; html: string } {
  const urgent = tasks.filter((t) => t.priority === 'URGENT');
  const high = tasks.filter((t) => t.priority === 'HIGH');
  const normal = tasks.filter((t) => t.priority === 'NORMAL');

  const priorityColor = (p: string) =>
    p === 'URGENT' ? '#dc2626' : p === 'HIGH' ? '#d97706' : '#64748b';

  const row = (t: (typeof tasks)[number]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${BORDER_COLOR};vertical-align:top;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColor(t.priority)};margin-right:8px;"></span>
        <strong style="color:#1a1a1a;font-size:14px;">${escapeHtml(t.title)}</strong>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">
          ${t.source}${t.callerPhone ? ` · ${escapeHtml(t.callerPhone)}` : ''}
        </div>
      </td>
    </tr>`;

  const section = (label: string, list: typeof tasks) =>
    list.length === 0
      ? ''
      : `
    <h3 style="color:${priorityColor(list[0].priority)};font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 8px;">${label} (${list.length})</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER_COLOR};border-radius:8px;overflow:hidden;">
      ${list.map(row).join('')}
    </table>`;

  const total = tasks.length;
  return {
    subject: `${total} action item${total === 1 ? '' : 's'} waiting${urgent.length > 0 ? ` — ${urgent.length} urgent` : ''}`,
    html: layout(`
      <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 8px;">Your action items</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Good morning ${escapeHtml(businessName)}. You have <strong>${total}</strong> open item${total === 1 ? '' : 's'} in your inbox.
      </p>
      ${section('Urgent', urgent)}
      ${section('High priority', high)}
      ${section('Normal', normal)}
      <div style="text-align:center;margin-top:28px;">
        ${button('Open dashboard', `${DASHBOARD_URL}/dashboard/tasks`)}
      </div>
    `),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Agency partner emails ───────────────────────────────────────────────────

export function agencyApprovedEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Your partner application has been approved!',
    html: layout(`
      <h2 style="color: #1e293b; margin: 0 0 16px">Welcome to the Partner Program, ${escapeHtml(name)}!</h2>
      <p>Great news — your application to become a RingbackSMS partner has been approved.</p>
      <p>Here's what to do next:</p>
      <ol>
        <li>Log in to <a href="${DASHBOARD_URL}/partner/settings">Partner Settings</a></li>
        <li>Connect your bank account via Stripe to start receiving payouts</li>
        <li>Create your first tenant and start earning revenue share</li>
      </ol>
      <p style="margin-top: 20px">
        <a href="${DASHBOARD_URL}/partner/overview" style="background: ${BRAND_COLOR}; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Go to Partner Dashboard</a>
      </p>
    `),
  };
}

export function agencyRejectedEmail(name: string, reason?: string | null): { subject: string; html: string } {
  return {
    subject: 'Update on your partner application',
    html: layout(`
      <h2 style="color: #1e293b; margin: 0 0 16px">Hi ${escapeHtml(name)},</h2>
      <p>Thank you for your interest in the RingbackSMS Partner Program. After reviewing your application, we're unable to approve it at this time.</p>
      ${reason ? `<p style="color: #64748b; font-style: italic;">${escapeHtml(reason)}</p>` : ''}
      <p>If you have questions or want to re-apply in the future, contact us at <a href="mailto:info@ringbacksms.com">info@ringbacksms.com</a>.</p>
    `),
  };
}

export function payoutConfirmationEmail(
  name: string,
  amountCents: number,
  periodLabel: string,
): { subject: string; html: string } {
  const amount = (amountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return {
    subject: `Payout sent: ${amount}`,
    html: layout(`
      <h2 style="color: #1e293b; margin: 0 0 16px">Payout Sent</h2>
      <p>Hi ${escapeHtml(name)}, your payout of <strong>${amount}</strong> for ${escapeHtml(periodLabel)} has been initiated via Stripe Connect.</p>
      <p>Funds typically arrive in your bank account within 2-5 business days.</p>
      <p style="margin-top: 20px">
        <a href="${DASHBOARD_URL}/partner/payouts" style="background: ${BRAND_COLOR}; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">View Payouts</a>
      </p>
    `),
  };
}
