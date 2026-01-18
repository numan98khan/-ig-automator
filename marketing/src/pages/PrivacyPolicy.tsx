import React from 'react';
import Seo from '../components/Seo';

const PrivacyPolicy: React.FC = () => {
  const seoDescription =
    'Privacy policy for SendFx, a multi-channel DM automation and CRM platform.';

  return (
    <>
      <Seo
        title="Privacy Policy | SendFx"
        description={seoDescription}
        canonicalPath="/privacy-policy"
        robots="index, follow"
      />
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: '1.6',
        color: '#333'
      }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Privacy Policy</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>Last updated: {new Date().toLocaleDateString()}</p>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>1. Introduction</h2>
        <p>
          Welcome to AI Instagram Inbox ("we," "our," or "us"). We are committed to protecting your privacy
          and handling your data in an open and transparent manner. This Privacy Policy explains how we collect,
          use, and protect your information when you use our service.
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>2. Information We Collect</h2>
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>2.1 Instagram Account Information</h3>
        <p>When you connect your Instagram Business Account, we collect:</p>
        <ul style={{ marginLeft: '20px' }}>
          <li>Instagram Business Account ID</li>
          <li>Username and profile information</li>
          <li>Access tokens for API communication</li>
        </ul>

        <h3 style={{ fontSize: '18px', marginBottom: '10px', marginTop: '20px' }}>2.2 Message and Conversation Data</h3>
        <p>To provide our service, we collect and store:</p>
        <ul style={{ marginLeft: '20px' }}>
          <li>Direct messages sent to your Instagram Business Account</li>
          <li>Comments on your Instagram posts</li>
          <li>Conversation metadata (timestamps, participant IDs)</li>
        </ul>

        <h3 style={{ fontSize: '18px', marginBottom: '10px', marginTop: '20px' }}>2.3 User Account Information</h3>
        <ul style={{ marginLeft: '20px' }}>
          <li>Email address</li>
          <li>Account credentials (securely hashed)</li>
          <li>Workspace preferences and settings</li>
        </ul>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>3. How We Use Your Information</h2>
        <p>We use the collected information to:</p>
        <ul style={{ marginLeft: '20px' }}>
          <li>Provide and maintain our Instagram inbox management service</li>
          <li>Display your Instagram messages and conversations in our interface</li>
          <li>Generate AI-powered responses to customer inquiries</li>
          <li>Send messages on your behalf when you initiate them</li>
          <li>Improve and optimize our service</li>
          <li>Communicate with you about service updates</li>
        </ul>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>4. Data Storage and Security</h2>
        <p>
          We store your data securely using industry-standard practices:
        </p>
        <ul style={{ marginLeft: '20px' }}>
          <li>All data is encrypted in transit using HTTPS/TLS</li>
          <li>Credentials and access tokens are encrypted at rest</li>
          <li>We use secure cloud infrastructure providers</li>
          <li>Access to data is restricted to authorized personnel only</li>
        </ul>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>5. Data Sharing and Third Parties</h2>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul style={{ marginLeft: '20px' }}>
          <li><strong>Instagram/Meta:</strong> We communicate with Instagram's API to retrieve and send messages on your behalf</li>
          <li><strong>OpenAI:</strong> Message content may be sent to OpenAI's API to generate AI responses</li>
          <li><strong>Service Providers:</strong> Cloud hosting and infrastructure providers who help us operate our service</li>
        </ul>
        <p style={{ marginTop: '15px' }}>
          All third-party providers are contractually obligated to protect your data and use it only for the purposes we specify.
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>6. Instagram Platform Policy Compliance</h2>
        <p>
          Our use of Instagram data complies with Instagram's Platform Policy. We:
        </p>
        <ul style={{ marginLeft: '20px' }}>
          <li>Only access data you explicitly authorize</li>
          <li>Use Instagram data solely to provide our service</li>
          <li>Respect Instagram's rate limits and usage guidelines</li>
          <li>Do not use Instagram data for advertising or marketing purposes</li>
        </ul>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>7. Your Rights and Choices</h2>
        <p>You have the right to:</p>
        <ul style={{ marginLeft: '20px' }}>
          <li><strong>Access:</strong> Request a copy of your data</li>
          <li><strong>Correct:</strong> Update or correct your information</li>
          <li><strong>Delete:</strong> Request deletion of your account and associated data</li>
          <li><strong>Disconnect:</strong> Revoke Instagram access at any time through your account settings</li>
          <li><strong>Export:</strong> Download your data in a portable format</li>
        </ul>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>8. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active or as needed to provide our services.
          When you delete your account, we will delete or anonymize your data within 30 days, except where
          we are required to retain it for legal or regulatory purposes.
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>9. Children's Privacy</h2>
        <p>
          Our service is not intended for users under the age of 13. We do not knowingly collect information
          from children under 13. If you believe we have collected information from a child under 13, please
          contact us immediately.
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>10. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting
          the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review
          this Privacy Policy periodically for any changes.
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>11. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <p style={{ marginTop: '15px' }}>
          <strong>Email:</strong> privacy@yourcompany.com<br />
          <strong>Website:</strong> https://yourwebsite.com
        </p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>12. International Data Transfers</h2>
        <p>
          Your information may be transferred to and processed in countries other than your country of residence.
          These countries may have data protection laws that are different from the laws of your country. We take
          steps to ensure that your data receives an adequate level of protection wherever it is processed.
        </p>
      </section>

      <div style={{
        marginTop: '50px',
        paddingTop: '20px',
        borderTop: '1px solid #e0e0e0',
        textAlign: 'center',
        color: '#666',
        fontSize: '14px'
      }}>
        <p>© {new Date().getFullYear()} AI Instagram Inbox. All rights reserved.</p>
      </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;
