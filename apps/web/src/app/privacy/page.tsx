import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Privacy Policy — RingBackSMS',
  description: 'RingBackSMS privacy policy. Learn how we collect, use, and protect your data.',
  alternates: { canonical: 'https://ringbacksms.com/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size="md" variant="light" />
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            &larr; Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 10, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              Agape Technology Solutions (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the RingBackSMS platform (&quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By using RingBackSMS, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.1 Account Information</h3>
            <p className="text-gray-700 leading-relaxed">
              When you create an account, we collect your name, email address, business name, and billing information. This information is necessary to provide and manage your account.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.2 Phone and Messaging Data</h3>
            <p className="text-gray-700 leading-relaxed">
              Our Service processes phone call metadata (caller phone number, call time, call duration) and SMS messages sent and received through your RingBackSMS number. This data is necessary to provide the core functionality of the Service, including automated SMS responses to missed calls.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.3 End-User Data</h3>
            <p className="text-gray-700 leading-relaxed">
              When someone calls your business and receives an automated SMS reply, we collect their phone number and the content of any SMS messages exchanged. This data is stored securely and associated with your business account. End-user phone numbers are never used for any purpose other than delivering the Service to the specific business account that received their call.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.4 Usage Data</h3>
            <p className="text-gray-700 leading-relaxed">
              We collect information about how you use the Service, including pages visited, features used, and interactions with the dashboard. This helps us improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed">We use the collected information to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process and respond to missed calls with SMS messages on your behalf</li>
              <li>Manage your account and process billing</li>
              <li>Send you service-related communications (account notifications, billing updates)</li>
              <li>Analyze usage patterns to improve the Service</li>
              <li>Maintain opt-out suppression lists to honor end-user messaging preferences</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Data Sharing and Disclosure</h2>
            <p className="text-gray-700 leading-relaxed">
              We do not sell, trade, or rent your personal information or your end-users&apos; data to third parties for marketing purposes. We may share information with:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li><strong>Service providers:</strong> Twilio (telephony and SMS), Stripe (payment processing), and other vendors necessary to operate the Service. These providers are contractually bound to protect your data.</li>
              <li><strong>Legal requirements:</strong> When required by law, regulation, court order, or legal process.</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, with notice to affected users.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              We will never share end-user phone numbers or message content with advertisers, data brokers, or unaffiliated third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We implement industry-standard security measures to protect your data, including encryption of sensitive data at rest and in transit, secure credential storage, and regular security audits. Twilio sub-account credentials are encrypted before storage. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your account data for as long as your account is active. Messaging and conversation data is retained for 12 months from the date of the conversation, after which it is automatically purged unless retention is required by law or is necessary to honor an active opt-out record.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2">
              Opt-out suppression records (phone numbers that have replied STOP) are retained indefinitely to ensure those numbers are never re-messaged, even after account changes or cancellation.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2">
              Upon account cancellation, we will delete your account and associated business data within 90 days, except where retention is required by law or needed to resolve outstanding billing disputes.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2">
              You may request deletion of your data at any time by contacting us at info@ringbacksms.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. SMS Messaging Consent and End-User Rights</h2>
            <p className="text-gray-700 leading-relaxed">
              <strong>For End Users (Callers):</strong> If you received an automated text message after calling a business that uses RingBackSMS, your phone number was processed solely to send you that reply. You can stop all messages at any time by replying STOP. Your number will be added to a permanent suppression list and you will not receive further messages.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">7.1 Basis for Initial SMS</h3>
            <p className="text-gray-700 leading-relaxed">
              The initial automated SMS sent to a caller is a direct service response to an unanswered call to a business using the RingBackSMS platform. Business subscribers are required by our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link> to maintain appropriate caller disclosures — such as a voicemail greeting or website notice — informing callers that an automated SMS may be sent in response to their call. The initial message clearly identifies the business by name, explains it is a response to a missed call, and includes opt-out instructions.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">7.2 Continued Conversation</h3>
            <p className="text-gray-700 leading-relaxed">
              End users who reply to the initial SMS voluntarily opt in to a continued AI-assisted conversation. No additional messages are sent to end users who do not reply. Message frequency after opt-in varies based on the end user&apos;s own engagement.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">7.3 Opt-Out</h3>
            <p className="text-gray-700 leading-relaxed">
              All messages include opt-out instructions. End users may reply <strong>STOP</strong> at any time to permanently opt out from receiving messages from that business number. RingBackSMS honors all opt-out requests immediately and maintains a persistent suppression list. Opted-out numbers will not receive further messages from the associated business number under any circumstances, including after account updates or number reassignment.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">7.4 No Third-Party Marketing</h3>
            <p className="text-gray-700 leading-relaxed">
              End-user phone numbers and message content collected through the Service are never used for third-party marketing, sold to data brokers, or shared with advertisers. This data is used solely to deliver the missed-call response service for the specific business account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Your Rights as a Subscriber</h2>
            <p className="text-gray-700 leading-relaxed">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Data portability</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              To exercise any of these rights, contact us at info@ringbacksms.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. California Residents — CCPA Rights</h2>
            <p className="text-gray-700 leading-relaxed">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA), including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>The right to know what personal information we collect, use, disclose, and sell</li>
              <li>The right to delete personal information we have collected from you</li>
              <li>The right to correct inaccurate personal information</li>
              <li>The right to opt out of the sale or sharing of personal information</li>
              <li>The right to non-discrimination for exercising your privacy rights</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              We do not sell or share personal information as defined under the CCPA/CPRA. To exercise any of your California privacy rights, contact us at info@ringbacksms.com. We will respond to verified requests within 45 days as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Other State Privacy Rights</h2>
            <p className="text-gray-700 leading-relaxed">
              Residents of Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), Texas (TDPSA), and other states with applicable privacy laws may have similar rights to access, delete, correct, and opt out of certain data processing. To exercise these rights, contact us at info@ringbacksms.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Children&apos;s Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children under 18. If we become aware that we have inadvertently collected personal information from a child under 18, we will take steps to delete that information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">12. Cookies and Tracking</h2>
            <p className="text-gray-700 leading-relaxed">
              Our dashboard and website may use cookies and similar tracking technologies to maintain session state, remember preferences, and analyze usage. You may control cookie settings through your browser. Disabling cookies may affect the functionality of the Service dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">13. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page, updating the &quot;Last updated&quot; date, and sending an email notification to active subscribers. Your continued use of the Service after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">14. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy, our data practices, or to exercise any of your privacy rights, contact us at:
            </p>
            <p className="text-gray-700 mt-2">
              <strong>Agape Technology Solutions</strong><br />
              Email: info@ringbacksms.com<br />
              Website: <Link href="https://ringbacksms.com" className="text-blue-600 hover:underline">ringbacksms.com</Link>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Agape Technology Solutions. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-900 font-medium">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
