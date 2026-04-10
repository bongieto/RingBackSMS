import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Terms and Conditions — RingBackSMS',
  description: 'RingBackSMS terms and conditions of service.',
  alternates: { canonical: 'https://ringbacksms.com/terms' },
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
        <p className="text-sm text-gray-500 mb-8">Last updated: April 10, 2026</p>

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
            <p className="text-gray-700 leading-relaxed">RingBackSMS Missed Call Recovery System</p>

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
              End users may opt out at any time by replying <strong>STOP</strong> to any message received from a RingBackSMS number. Upon opting out, the end user will receive a one-time confirmation message and will no longer receive messages from that number. Opt-out requests are honored immediately and a persistent suppression list is maintained so that opted-out numbers are never re-messaged, even after account changes.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.5 Help</h3>
            <p className="text-gray-700 leading-relaxed">
              End users may reply <strong>HELP</strong> to any message for assistance. They will receive a response with support contact information.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.6 Support Contact</h3>
            <p className="text-gray-700 leading-relaxed">
              For questions about messaging, contact info@ringbacksms.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Account Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              You must be at least 18 years old and a human to create an account. You are responsible for maintaining the security of your account and for all activities that occur under your account. You must provide accurate and complete information when creating your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Subscriber TCPA and Messaging Compliance</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Important:</strong> As a business subscriber, you are responsible for ensuring your use of this Service complies with all applicable messaging laws, including the Telephone Consumer Protection Act (TCPA).
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">4.1 Subscriber TCPA Liability</h3>
            <p className="text-gray-700 leading-relaxed">
              You, as a business subscriber, represent and warrant that your use of the Service complies with the Telephone Consumer Protection Act (TCPA), the CAN-SPAM Act, and all applicable federal, state, and local messaging laws. You are solely responsible for ensuring that the consent mechanism used with your callers — including any voicemail disclosure, website notice, in-store signage, or other caller-facing disclosure — meets applicable legal standards. Agape Technology Solutions is not responsible for TCPA violations arising from your failure to implement adequate caller consent disclosures.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">4.2 Recommended Caller Disclosure</h3>
            <p className="text-gray-700 leading-relaxed">
              To support TCPA compliance, subscribers are strongly encouraged to include the following or similar language in their business voicemail greeting:
            </p>
            <blockquote className="border-l-4 border-blue-200 bg-blue-50 px-4 py-3 my-3 text-gray-700 italic">
              &quot;You&apos;ve reached [Your Business Name]. We missed your call. You may receive an automated text message reply so we can assist you. Reply STOP at any time to opt out. Message and data rates may apply.&quot;
            </blockquote>
            <p className="text-gray-700 leading-relaxed">
              Additionally, if your business has a public-facing website, you are encouraged to include a notice that callers may receive an automated SMS reply to unanswered calls, with a link to your privacy policy. While these disclosures are not enforced by the Service, they represent best practices for consent documentation under TCPA guidance and are strongly recommended before activating the Service.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">4.3 Prohibited Use — Messaging Laws</h3>
            <p className="text-gray-700 leading-relaxed">
              You agree not to use the Service in any manner that violates the TCPA, including sending messages to numbers on the National Do Not Call Registry where applicable, or to numbers that have previously opted out via the STOP keyword.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Send spam, unsolicited messages, or bulk marketing messages</li>
              <li>Send messages containing illegal, harmful, threatening, abusive, or harassing content</li>
              <li>Impersonate any person or entity</li>
              <li>Violate any applicable local, state, national, or international law, including the TCPA and CAN-SPAM Act</li>
              <li>Send messages to numbers that have opted out</li>
              <li>Engage in any activity that interferes with or disrupts the Service</li>
              <li>Resell or sublicense the Service without a written reseller agreement with Agape Technology Solutions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Agency and Reseller Terms</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">6.1 Reseller Agreement Required</h3>
            <p className="text-gray-700 leading-relaxed">
              Marketing agencies, consultants, and other third parties may not resell, white-label, or sublicense access to the Service on behalf of their clients without entering into a separate written Reseller Agreement with Agape Technology Solutions. Unauthorized resale or sublicensing is a material breach of these Terms and may result in immediate account termination.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">6.2 Agency Responsibility for Clients</h3>
            <p className="text-gray-700 leading-relaxed">
              Agencies operating accounts on behalf of clients are responsible for ensuring that all client usage complies with these Terms, applicable messaging laws, and any applicable Twilio acceptable use policies. Agencies represent and warrant that they have obtained all necessary authorizations from their clients to configure and operate the Service on their behalf.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">6.3 Sub-Account Usage</h3>
            <p className="text-gray-700 leading-relaxed">
              Agencies managing multiple client phone numbers through a single RingBackSMS account acknowledge that each business phone number configured within the Service represents a separate business subscriber for purposes of TCPA compliance, and that the agency bears responsibility for compliance on behalf of each such subscriber.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Billing and Subscriptions</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is offered on a subscription basis. Subscription fees are billed in advance on a monthly basis. Telephony costs (phone number rental and per-message fees) are billed through Twilio according to their published rates. You are responsible for all charges associated with your account, including Twilio usage fees.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2">
              You may cancel your subscription at any time. Upon cancellation, your account will remain active until the end of the current billing period. Refunds are not provided for partial months of service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. AI-Generated Content</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service uses artificial intelligence to generate SMS responses on behalf of your business. While we strive for accuracy, AI-generated content may occasionally be inaccurate or inappropriate. You are responsible for configuring your greeting messages, business information, and conversation flows. You agree to review and configure AI response parameters and acknowledge that reliance on default AI responses without customization is at your own risk. You acknowledge that you are ultimately responsible for all messages sent from your RingBackSMS number.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Phone Number Provisioning</h2>
            <p className="text-gray-700 leading-relaxed">
              Phone numbers provisioned through the Service are provided by Twilio and are subject to Twilio&apos;s acceptable use policy. Phone numbers remain the property of Twilio and are leased for your use during your active subscription. Upon account cancellation, your phone number may be released after a grace period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Your use of the Service is also governed by our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, which describes how we collect, use, and protect your data and your end users&apos; data. Information collected through the Service will not be shared with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Service Availability</h2>
            <p className="text-gray-700 leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted service. The Service depends on third-party providers (Twilio, cloud infrastructure) that may experience downtime. We are not liable for damages resulting from service interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">12. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, Agape Technology Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
            </p>
            <p className="text-gray-700 leading-relaxed mt-2 text-sm italic">
              Note: Agape Technology Solutions is not a law firm and does not provide legal advice. The compliance guidance in these Terms is informational. You are encouraged to consult qualified legal counsel regarding your specific TCPA compliance obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">13. Modifications to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">14. Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              We may suspend or terminate your account at any time for violation of these Terms, including misuse of the messaging platform or failure to comply with applicable messaging laws. You may terminate your account at any time by canceling your subscription through the dashboard or by contacting support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">15. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms are governed by the laws of the State of Illinois, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">16. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              For questions about these Terms, contact us at:
            </p>
            <p className="text-gray-700 mt-2">
              <strong>Agape Technology Solutions</strong><br />
              Email: info@ringbacksms.com
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
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
