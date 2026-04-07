import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Terms and Conditions — RingBackSMS',
  description: 'RingBackSMS terms and conditions of service.',
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms and Conditions</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 6, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Service Description</h2>
            <p className="text-gray-700 leading-relaxed">
              RingBackSMS (&quot;the Service&quot;) is a missed-call text-back platform operated by Agape Technology Solutions (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). The Service automatically sends SMS responses to callers when your business phone goes unanswered. Messages may include greetings, business information, menu items, appointment scheduling, and AI-powered conversational responses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Messaging Program Details</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.1 Program Name</h3>
            <p className="text-gray-700 leading-relaxed">RingBackSMS Missed Call Auto-Reply</p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.2 Message Frequency</h3>
            <p className="text-gray-700 leading-relaxed">
              End users receive one initial SMS in response to a missed call. Additional messages are sent only if the end user replies and engages in conversation. Message frequency varies based on the end user&apos;s engagement. This is not a recurring marketing messaging program.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.3 Message and Data Rates</h3>
            <p className="text-gray-700 leading-relaxed">
              Standard message and data rates may apply to end users based on their mobile carrier plan. RingBackSMS does not charge end users for receiving messages.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.4 Opt-Out</h3>
            <p className="text-gray-700 leading-relaxed">
              End users may opt out at any time by replying <strong>STOP</strong> to any message received from a RingBackSMS number. Upon opting out, the end user will receive a confirmation message and will no longer receive messages from that number.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.5 Help</h3>
            <p className="text-gray-700 leading-relaxed">
              End users may reply <strong>HELP</strong> to any message for assistance. They will receive a response with support contact information.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.6 Support Contact</h3>
            <p className="text-gray-700 leading-relaxed">
              For questions about messaging, contact support@ringbacksms.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Account Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              You must be at least 18 years old and a human to create an account. You are responsible for maintaining the security of your account and for all activities that occur under your account. You must provide accurate and complete information when creating your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Send spam, unsolicited messages, or bulk marketing messages</li>
              <li>Send messages containing illegal, harmful, threatening, abusive, or harassing content</li>
              <li>Impersonate any person or entity</li>
              <li>Violate any applicable local, state, national, or international law, including the Telephone Consumer Protection Act (TCPA) and CAN-SPAM Act</li>
              <li>Send messages to numbers that have opted out</li>
              <li>Engage in any activity that interferes with or disrupts the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Billing and Subscriptions</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is offered on a subscription basis. Subscription fees are billed in advance on a monthly basis. Telephony costs (phone number rental and per-message fees) are billed through Twilio according to their published rates. You are responsible for all charges associated with your account, including Twilio usage fees.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2">
              You may cancel your subscription at any time. Upon cancellation, your account will remain active until the end of the current billing period. Refunds are not provided for partial months of service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. AI-Generated Content</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service uses artificial intelligence to generate SMS responses on behalf of your business. While we strive for accuracy, AI-generated content may occasionally be inaccurate or inappropriate. You are responsible for configuring your greeting messages, business information, and conversation flows. You acknowledge that you are ultimately responsible for all messages sent from your RingBackSMS number.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Phone Number Provisioning</h2>
            <p className="text-gray-700 leading-relaxed">
              Phone numbers provisioned through the Service are provided by Twilio and are subject to Twilio&apos;s acceptable use policy. Phone numbers remain the property of Twilio and are leased for your use during your active subscription. Upon account cancellation, your phone number may be released after a grace period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Your use of the Service is also governed by our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, which describes how we collect, use, and protect your data and your end users&apos; data. Information collected through the Service will not be shared with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Service Availability</h2>
            <p className="text-gray-700 leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted service. The Service depends on third-party providers (Twilio, cloud infrastructure) that may experience downtime. We are not liable for damages resulting from service interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, Agape Technology Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Modifications to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">12. Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              We may suspend or terminate your account at any time for violation of these Terms, including misuse of the messaging platform. You may terminate your account at any time by canceling your subscription through the dashboard or by contacting support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">13. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms are governed by the laws of the State of Illinois, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">14. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              For questions about these Terms, contact us at:
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
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900 font-medium">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
