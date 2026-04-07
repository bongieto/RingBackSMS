import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Privacy Policy — RingBackSMS',
  description: 'RingBackSMS privacy policy. Learn how we collect, use, and protect your data.',
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
        <p className="text-sm text-gray-500 mb-8">Last updated: April 6, 2026</p>

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
              When someone calls your business and receives an automated SMS reply, we collect their phone number and the content of any SMS messages exchanged. This data is stored securely and associated with your business account.
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
              <li><strong>Legal requirements:</strong> When required by law, regulation, or legal process.</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, with notice to affected users.</li>
            </ul>
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
              We retain your account data for as long as your account is active. Conversation and messaging data is retained for a reasonable period necessary for the Service to function (including conversation history and analytics). You may request deletion of your data by contacting us. Upon account cancellation, we will delete your data within 90 days, except where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. SMS and Messaging Consent</h2>
            <p className="text-gray-700 leading-relaxed">
              End users who call your business and receive an automated SMS reply are not subscribed to any recurring messaging campaign. The initial SMS is triggered by their call to your business. If an end user continues the conversation by replying, they are engaging voluntarily. Any end user may reply STOP at any time to opt out of receiving further messages from your RingBackSMS number.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Data portability</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              To exercise any of these rights, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Children&apos;s Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="text-gray-700 mt-2">
              <strong>Agape Technology Solutions</strong><br />
              Email: support@ringbacksms.com
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
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
