const constants = require('./constants');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SERVICE_AGREEMENT_SECTIONS = [
  {
    title: '01: Engagement and Scope of Services',
    paragraphs: [
      'Beige\'s submission of a proposal for a Project constitutes an offer to provide Services and related deliverables under the terms of this Agreement. The Client\'s approval of the proposal constitutes acceptance of this offer, and this Agreement becomes effective with respect to the specific Services upon such approval. The parties agree that any proposal, including scope, deliverables, timeline, and pricing, shall be deemed incorporated into this Agreement by reference upon approval.'
    ]
  },
  {
    title: '02: Client Obligations & Cooperation',
    paragraphs: [
      'The Client agrees to fulfill any responsibilities outlined in the approved proposal or undertaken thereafter. This includes providing timely input, approvals, and coordination as needed throughout the project. Beige shall not be responsible for delays, missed opportunities, or project issues resulting from incomplete or delayed Client input.'
    ]
  },
  {
    title: '03: Payment and Process Deposits, Cancellations & Refunds',
    paragraphs: [
      'All payments are final once any portion of the Services has begun. Deposits are non-refundable and are used to reserve the production date, retain creative talent, and initiate pre-production.',
      'Cancellations made more than 7 days prior to a scheduled shoot may be eligible for shoot credit, at Beige\'s sole discretion.',
      'Cancellations within 7 days of a scheduled shoot may result in partial or full forfeiture of paid amounts.',
      'Refunds are not customary and are considered only in exceptional circumstances, at Beige\'s sole discretion. No partial refund is guaranteed.',
      'Beige is committed to professional service and, where appropriate, may offer post-production adjustments or other discretionary resolutions. These options are provided solely at Beige\'s discretion and do not constitute an obligation or guarantee.',
      'Requests to reschedule or postpone a confirmed shoot date will be accommodated when possible. Frequent or last-minute changes may result in rescheduling or cancellation fees.'
    ]
  },
  {
    title: '04: Overtime Charges',
    paragraphs: [
      'If the Client requests that the Creative Partner ("CP") stay beyond the contracted hours on the day of the shoot, overtime charges will apply at the predetermined rate provided in the initial contract. Since CP overtime availability may vary, the Client is encouraged to notify their designated Beige representative as soon as additional time is anticipated, ideally before the shoot date, to ensure proper coordination. Full payment for overtime is required before deliverables are provided.'
    ]
  },
  {
    title: '05: Client No-Show Policy',
    paragraphs: [
      'If Beige arrives at the scheduled shoot location and the Client or designated representative is not present, a one-hour grace period will be provided. After that, Beige reserves the right to leave the premises and consider the shoot canceled, subject to further communication. In such cases, no refund shall be issued, and rescheduling may incur additional fees.'
    ]
  },
  {
    title: '06: Creative Subjectivity',
    paragraphs: [
      'The Client acknowledges that creative services such as videography and editing are inherently subjective. Beige will make best efforts to align with the Client\'s vision as outlined in the proposal or pre-production documentation, but artistic judgment will ultimately remain at the discretion of the creative team.'
    ]
  },
  {
    title: '07: Proprietary Rights',
    paragraphs: [
      'Ownership: The Client owns all intellectual property rights to the photo and video deliverables in all formats. Such work shall be considered "work made for hire."',
      'Beige License: Beige Corporation retains a perpetual, non-exclusive license to display, reproduce, and distribute the deliverables solely for use in its portfolio, showreels, and other self-promotional materials, unless the Client provides written objection prior to or upon delivery of the final files.'
    ]
  },
  {
    title: '08: Content Storage',
    paragraphs: [
      'Beige will maintain the Client\'s final deliverables in its cloud storage for a period of one (1) year following the Project\'s completion. After this period, Beige may delete the files from its systems without notice. It is the Client\'s sole responsibility to download, archive, and maintain copies of the deliverables for future use.'
    ]
  },
  {
    title: '09: Confidentiality',
    paragraphs: [
      'Both parties agree to maintain confidentiality regarding any proprietary information, materials, or business strategies exchanged during the term of this Agreement. Neither party will disclose such information to third parties without the prior written consent of the other party.'
    ]
  },
  {
    title: '10: Indemnification',
    paragraphs: [
      'The Client agrees to indemnify and hold harmless Beige Corporation, its officers, directors, contractors, employees, and agents from any and all claims, losses, damages, or expenses (including attorney\'s fees) arising out of the Client\'s use of the Services or any breach of this Agreement.'
    ]
  },
  {
    title: '11: Disclaimer of Warranties',
    paragraphs: [
      'Except as expressly set forth in this Agreement, Beige Corporation makes no warranties, express or implied, including without limitation any implied warranties of merchantability or fitness for a particular purpose. The Services are provided "as is" and "as available."'
    ]
  },
  {
    title: '12: Limitation of Liability',
    paragraphs: [
      'In no event shall Beige Corporation\'s total liability arising out of or related to this Agreement exceed the total fees paid by the Client for the Project. Beige shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits or revenue, arising out of or relating to the Services provided.'
    ]
  },
  {
    title: '13: Force Majeure',
    paragraphs: [
      'Neither party shall be held liable for any delay or failure in performance under this Agreement due to circumstances beyond their reasonable control, including but not limited to war, terrorism, or other force majeure events.'
    ]
  },
  {
    title: '14: Non-Disparagement',
    paragraphs: [
      'The Client agrees not to make any public statement, review, or communication that is false, misleading, or disparaging about Beige Corporation, its employees, services, or reputation. This includes but is not limited to online reviews, social media posts, or other public commentary. This clause shall survive termination or completion of this Agreement.'
    ]
  },
  {
    title: '15: Communication Boundaries',
    paragraphs: [
      'Client agrees to provide timely information and approvals. Beige is not liable for delays caused by incomplete input. While direct communication with personnel (such as videographers or editors) may occur for logistical or creative purposes, all official decisions and coordination must go through your designated Beige representative. To protect our partnerships and ensure a smooth process, the Client agrees not to engage Beige\'s creative partners separately for related or future work outside the scope of this Agreement. Any such efforts may result in project suspension or other remedies at Beige\'s discretion.'
    ]
  },
  {
    title: '16: Dispute Resolution and Governing Law',
    paragraphs: [
      'All disputes arising out of or related to this Agreement shall be resolved exclusively through binding arbitration or mediation in Harris County, Texas, in accordance with the rules of the American Arbitration Association. The Client waives any right to bring or participate in class actions, class arbitrations, or collective claims against Beige Corporation. This Agreement shall be governed by and construed in accordance with the laws of the State of Texas.'
    ]
  },
  {
    title: '17: General Terms',
    paragraphs: [
      'This Agreement constitutes the entire understanding between the parties and supersedes all prior written or oral agreements. No changes shall be valid unless made in writing and signed by both parties. If any portion of this Agreement is deemed unenforceable, the remainder shall remain in full force and effect.'
    ]
  }
];


function renderQuoteAcceptPage({
  title,
  badge,
  description,
  quoteNumber = '',
  tone = 'success',
  statusCode = constants.OK.code,
  ctaHref: explicitCtaHref = null,
  ctaLabel: explicitCtaLabel = null
}) {
  const dashboardLink = String(process.env.FRONTEND_URL || 'https://beige.app/')
    .trim()
    .replace(/\/+$/, '') || 'https://beige.app';
  const brandLogoUrl = 'https://beige-web-prod.s3.us-east-1.amazonaws.com/beige/assets/logos/beige_logo_vb.png';
  const separatorUrl = 'https://beige-web-prod.s3.us-east-1.amazonaws.com/beige/assets/email_assets/HorizontalSeparator.png';

  const palette = tone === 'error'
    ? {
      accent: '#E88E8E',
      panel: 'linear-gradient(180deg, rgba(35,36,40,0.98) 0%, rgba(25,25,28,0.98) 100%)',
      border: 'rgba(255,255,255,0.12)',
      iconBg: '#F4C4C4',
      ctaBg: '#F4C4C4',
      ctaText: '#2A1717',
      surface: '#1D1E22',
      shadow: 'rgba(0,0,0,0.42)'
    }
    : tone === 'warning'
      ? {
        accent: '#E6C98A',
        panel: 'linear-gradient(180deg, rgba(35,36,40,0.98) 0%, rgba(25,25,28,0.98) 100%)',
        border: 'rgba(255,255,255,0.12)',
        iconBg: '#EED7A7',
        ctaBg: '#EED7A7',
        ctaText: '#2D2414',
        surface: '#1D1E22',
        shadow: 'rgba(0,0,0,0.42)'
      }
      : {
        accent: '#E9D0A1',
        panel: 'linear-gradient(180deg, rgba(35,36,40,0.98) 0%, rgba(25,25,28,0.98) 100%)',
        border: 'rgba(255,255,255,0.12)',
        iconBg: '#F0D9AC',
        ctaBg: '#F0D9AC',
        ctaText: '#111111',
        surface: '#1D1E22',
        shadow: 'rgba(0,0,0,0.42)'
      };

  const statusIcon = tone === 'error' ? '&#10005;' : '&#10003;';

  const ctaLabel = explicitCtaLabel || (tone === 'error'
    ? 'CONTACT SALES'
    : tone === 'warning'
      ? 'OPEN DASHBOARD'
      : 'SIGN UP TO DASHBOARD');

  const ctaHref = explicitCtaHref || (tone === 'error'
    ? 'mailto:sales@beigecorporation.io'
    : tone === 'success'
      ? `${dashboardLink}/signup/user`
      : dashboardLink);

  return {
    statusCode,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 0;
              background: #4B4B4B;
              color: #ffffff;
              font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            a {
              color: inherit;
            }

            .page {
              min-height: 100vh;
              padding: 10px 0;
            }

            .shell {
              width: 500px;
              max-width: calc(100% - 18px);
              margin: 0 auto;
              background: #030303;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid rgba(255,255,255,0.07);
              box-shadow: 0 18px 48px rgba(0,0,0,0.38);
            }

            .header {
              height: 104px;
              padding-top: 26px;
              text-align: center;
            }

            .brand-pill {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 154px;
              height: 50px;
              padding: 0 26px;
              border-radius: 999px;
              background: linear-gradient(180deg, #34363A 0%, #282A2D 100%);
              border: 1px solid rgba(255,255,255,0.10);
              box-shadow:
                0 10px 24px rgba(255,255,255,0.08),
                inset 0 1px 0 rgba(255,255,255,0.10);
            }

            .brand-logo {
              display: block;
              width: 104px;
              max-width: 100%;
              height: auto;
              max-height: 24px;
              object-fit: contain;
            }

            .hero-wrap {
              padding: 82px 60px 0;
              text-align: center;
              background: #030303;
            }

            .hero-card {
              position: relative;
              width: 100%;
              min-height: 185px;
              margin: 0 auto;
              padding: 86px 34px 28px;
              border-radius: 18px;
              background: ${palette.panel};
              border: 1px solid ${palette.border};
              box-shadow: 0 18px 34px ${palette.shadow};
            }

            .icon-ring {
  position: absolute;
  left: 50%;
  top: -63px;
  transform: translateX(-50%);
  width: 126px;
  height: 126px;
  border-radius: 50%;
  background: #000000;
  box-shadow: 0 18px 36px rgba(0,0,0,0.45);
  overflow: visible;
}
  
.status-svg {
  display: block;
  width: 126px;
  height: 126px;
}
            .hero-badge {
              display: none;
            }

            .hero-title {
              margin: 0;
              color: #ffffff;
              font-size: 23px;
              line-height: 1.15;
              font-weight: 800;
              letter-spacing: -0.02em;
            }

            .hero-copy {
              max-width: 300px;
              margin: 12px auto 0;
              color: rgba(255,255,255,0.50);
              font-size: 13px;
              line-height: 1.45;
              font-weight: 400;
            }

            .cta-wrap {
              position: relative;
              padding: 0 0 22px;
              text-align: center;
              background: #030303;
            }

            .cta-stage {
              position: relative;
              display: inline-block;
              padding-top: 26px;
            }

            .cta-rail {
              position: absolute;
              top: 0;
              width: 6px;
              height: 31px;
              background: ${palette.ctaBg};
              border-radius: 0;
              z-index: 1;
            }

            .cta-rail-left {
              left: 78px;
            }

            .cta-rail-right {
              right: 78px;
            }

            .cta-button {
              position: relative;
              z-index: 2;
              display: inline-block;
              width: 230px;
              height: 39px;
              border-radius: 999px;
              background: ${palette.ctaBg};
              color: ${palette.ctaText};
              text-decoration: none;
              font-size: 12px;
              line-height: 39px;
              font-weight: 800;
              text-align: center;
              box-shadow: 0 10px 22px rgba(0,0,0,0.22);
            }

            .reference-panel {
              background: #171515;
              padding: 15px 43px 0;
              text-align: center;
              border-top: 2px solid rgba(255,255,255,0.10);
            }

            .reference-label {
              color: rgba(255,255,255,0.58);
              font-size: 12px;
              line-height: 1.2;
              letter-spacing: 0.20em;
              text-transform: uppercase;
            }

            .reference-value {
              margin-top: 7px;
              color: ${palette.accent};
              font-size: 17px;
              line-height: 1.2;
              font-weight: 800;
            }

            .contact-card {
              margin: 13px auto 0;
              padding: 16px 24px 17px;
              border-radius: 9px 9px 0 0;
              background: ${palette.surface};
              border: 1px solid rgba(255,255,255,0.14);
              border-bottom: 0;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
            }

            .contact-copy {
              color: rgba(255,255,255,0.38);
              font-size: 13px;
              line-height: 1.45;
            }

            .contact-link {
              display: inline-block;
              margin-top: 4px;
              color: #ffffff;
              font-size: 16px;
              line-height: 1.2;
              font-weight: 800;
              text-decoration: none;
            }

            .footer {
  height: 87px;
  padding: 0;
  text-align: center;
  color: rgba(255,255,255,0.42);
  font-size: 13px;
  line-height: 1.2;
  font-style: italic;
  background: #030303;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.footer-inner-separator {
  display: block;
  width: calc(100% - 80px);
  max-width: 420px;
  height: 1px;
  min-height: 1px;
  margin: 28px auto 28px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.10) 10%,
    rgba(255,255,255,0.18) 50%,
    rgba(255,255,255,0.10) 90%,
    rgba(255,255,255,0) 100%
  );
}

.footer-text {
  display: block;
}

.line-separator {
  display: block;
  width: calc(100% - 80px);
  max-width: 420px;
  height: 2px;
  min-height: 2px;
  margin: 0 auto;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.12) 10%,
    rgba(255,255,255,0.22) 50%,
    rgba(255,255,255,0.12) 90%,
    rgba(255,255,255,0) 100%
  );
  opacity: 1;
}

.header-line-separator {
  margin-top: 0;
  margin-bottom: 0;
}

.footer-inner-separator {
  display: block;
  width: calc(100% - 80px);
  max-width: 420px;
  height: 2px;
  min-height: 2px;
  margin: 26px auto 22px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.12) 10%,
    rgba(255,255,255,0.22) 50%,
    rgba(255,255,255,0.12) 90%,
    rgba(255,255,255,0) 100%
  );
  opacity: 1;
}

            @media (max-width: 540px) {
              .page {
                padding-top: 10px;
              }

              .shell {
                width: calc(100% - 18px);
                max-width: calc(100% - 18px);
              }

              .header {
                height: 104px;
                padding-top: 26px;
              }

              .brand-pill {
                width: 150px;
                height: 48px;
                padding: 0 24px;
              }

              .brand-logo {
                width: 100px;
                max-height: 23px;
              }

              .hero-wrap {
                padding: 82px 60px 0;
              }

              .hero-card {
                min-height: 185px;
                padding: 86px 28px 28px;
              }

              .hero-title {
                font-size: 23px;
              }

              .hero-copy {
                font-size: 13px;
              }

              .reference-panel {
                padding-left: 43px;
                padding-right: 43px;
              }
            }

            @media (max-width: 430px) {
              .hero-wrap {
                padding-left: 28px;
                padding-right: 28px;
              }

              .reference-panel {
                padding-left: 20px;
                padding-right: 20px;
              }

              .cta-button {
                width: 230px;
              }

              .cta-rail-left {
                left: 68px;
              }

              .cta-rail-right {
                right: 68px;
              }
            }
          </style>
        </head>

        <body>
          <div class="page">
            <div class="shell">
              <div class="header">
                  <div class="brand-pill">
                    <img class="brand-logo" src="${brandLogoUrl}" alt="BEIGE" />
                  </div>
                </div>

                <div class="line-separator header-line-separator"></div>

                <div class="hero-wrap">
                <div class="hero-card">
                  <div class="icon-ring">
                    <svg class="status-svg" viewBox="0 0 126 126" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <circle cx="63" cy="63" r="63" fill="#000000"/>

                      <!-- confetti -->
                      <rect x="61" y="9" width="8" height="8" rx="2" fill="#EA745F" transform="rotate(45 65 13)"/>
                      <rect x="91" y="20" width="8" height="8" rx="2" fill="#4D82FF" transform="rotate(28 95 24)"/>
                      <circle cx="109" cy="51" r="4" fill="#E3BF61"/>
                      <rect x="91" y="87" width="8" height="8" rx="2" fill="#EA745F" transform="rotate(28 95 91)"/>
                      <circle cx="76" cy="104" r="4" fill="#5FD68F"/>
                      <path d="M42 103 C39 99 41 95 46 96" stroke="#5FD68F" stroke-width="3" fill="none" stroke-linecap="round"/>
                      <rect x="20" y="83" width="8" height="8" rx="2" fill="#E3BF61" transform="rotate(35 24 87)"/>
                      <rect x="12" y="57" width="8" height="8" rx="2" fill="#4D82FF" transform="rotate(18 16 61)"/>
                      <circle cx="21" cy="35" r="4" fill="#5FD68F"/>
                      <rect x="43" y="16" width="5" height="9" rx="1.5" fill="#EA745F" transform="rotate(-25 45.5 20.5)"/>
                      <path d="M99 35 C102 31 106 31 108 35" stroke="#4D82FF" stroke-width="3" fill="none" stroke-linecap="round"/>
                      <path d="M105 75 C109 77 110 81 106 84" stroke="#EA745F" stroke-width="3" fill="none" stroke-linecap="round"/>
                      <path d="M22 71 C18 70 17 66 20 63" stroke="#E3BF61" stroke-width="3" fill="none" stroke-linecap="round"/>

                      <!-- center circle -->
                      <circle cx="63" cy="63" r="32" fill="${palette.iconBg}"/>

                      <!-- check -->
                      <path
                        d="M48 63.5 L58.5 75 L80 49"
                        stroke="#111111"
                        stroke-width="6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>

                  <div class="hero-badge">${badge}</div>
                  <h1 class="hero-title">${title}</h1>
                  <p class="hero-copy">${description}</p>
                </div>
              </div>

              <div class="cta-wrap">
                <div class="cta-stage">
                  <span class="cta-rail cta-rail-left" aria-hidden="true"></span>
                  <span class="cta-rail cta-rail-right" aria-hidden="true"></span>

                  <a class="cta-button" href="${ctaHref}" target="_blank" rel="noopener noreferrer">
                    ${ctaLabel} &#8594;
                  </a>
                </div>
              </div>

              <div class="reference-panel">
                <div class="reference-label">Quote Reference</div>
                <div class="reference-value">${quoteNumber || 'Unavailable'}</div>

                <div class="contact-card">
                  <div class="contact-copy">Our Team will continue from here. If you need help, Contact</div>
                  <a class="contact-link" href="mailto:sales@beigecorporation.io">sales@beigecorporation.io.</a>
                </div>
              </div>

              <div class="footer">
  <div class="footer-inner-separator"></div>
  <div class="footer-text">This is an automated Beige Confirmation Page</div>
</div>
            </div>
          </div>
        </body>
      </html>
    `
  };
}

function renderQuoteAgreementPage({
  quoteNumber = '',
  token = '',
  formAction = '',
  errorMessage = ''
}) {
  const dashboardLink = String(process.env.FRONTEND_URL || 'https://beige.app/')
    .trim()
    .replace(/\/+$/, '') || 'https://beige.app';

  const summaryParagraph = 'This Agreement is between the Client ("You") and Production Company ("Beige Corporation"), relating to Your Project (the "Project") as referenced and further described below. Client and Production Company agree that this Agreement governs the engagement of Production Company for services and related deliverables (collectively, "Services") for the Project. In consideration of the mutual obligations specified herein, the parties, intending to be legally bound, agree as follows:';

  const accordionMarkup = SERVICE_AGREEMENT_SECTIONS.map((section, index) => `
    <details class="agreement-item"${index === 0 ? ' open' : ''}>
      <summary class="agreement-summary">
        <span>${escapeHtml(section.title)}</span>
        <span class="agreement-chevron" aria-hidden="true"></span>
      </summary>
      <div class="agreement-content">
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      </div>
    </details>
  `).join('');

  return {
    statusCode: constants.OK.code,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Service Agreement & Terms of Engagement</title>
          <style>
            :root {
              --bg: #4b4b4b;
              --shell: #050505;
              --shell-border: rgba(255,255,255,0.08);
              --panel: #171717;
              --panel-border: rgba(255,255,255,0.09);
              --muted: rgba(255,255,255,0.66);
              --soft: rgba(255,255,255,0.46);
              --accent: #ecd4a7;
              --accent-deep: #221b10;
              --accent-surface: linear-gradient(180deg, #f4dfb8 0%, #e8d1ab 100%);
              --shadow: 0 28px 60px rgba(0,0,0,0.45);
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              padding: 20px 14px;
              background:
                radial-gradient(circle at top, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%),
                linear-gradient(180deg, #555555 0%, #474747 100%);
              color: #ffffff;
              font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            .page {
              min-height: calc(100vh - 40px);
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .shell {
              width: 100%;
              max-width: 620px;
              background: linear-gradient(180deg, rgba(8,8,8,0.98) 0%, rgba(2,2,2,0.99) 100%);
              border: 1px solid var(--shell-border);
              border-radius: 12px;
              overflow: hidden;
              box-shadow: var(--shadow);
            }

            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 28px 28px 22px;
              border-bottom: 1px solid rgba(255,255,255,0.08);
            }

            .title {
              margin: 0;
              font-size: 24px;
              line-height: 1.2;
              font-weight: 700;
            }

            .close-link {
              display: inline-flex;
              width: 38px;
              height: 38px;
              align-items: center;
              justify-content: center;
              border-radius: 999px;
              border: 1px solid rgba(255,255,255,0.12);
              background: rgba(255,255,255,0.10);
              color: #ffffff;
              text-decoration: none;
              font-size: 20px;
              line-height: 1;
            }

            .body {
              padding: 22px 24px 28px;
            }

            .summary-card {
              margin-bottom: 18px;
              padding: 18px 20px;
              border-radius: 8px;
              background: linear-gradient(180deg, #f9e8c8 0%, #edd4a4 100%);
              color: #1f1a14;
            }

            .summary-card h2 {
              margin: 0 0 8px;
              font-size: 15px;
              line-height: 1.2;
              font-weight: 700;
            }

            .summary-card p {
              margin: 0;
              font-size: 13px;
              line-height: 1.55;
            }

            .quote-ref {
              margin: 0 0 18px;
              color: var(--soft);
              font-size: 12px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }

            .agreement-list {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .agreement-item {
              border: 1px solid var(--panel-border);
              border-radius: 8px;
              background: var(--panel);
              overflow: hidden;
            }

            .agreement-summary {
              list-style: none;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              padding: 16px 18px;
              cursor: pointer;
              font-size: 16px;
              line-height: 1.35;
              font-weight: 500;
            }

            .agreement-summary::-webkit-details-marker {
              display: none;
            }

            .agreement-chevron {
              position: relative;
              flex: 0 0 14px;
              width: 14px;
              height: 14px;
            }

            .agreement-chevron::before,
            .agreement-chevron::after {
              content: "";
              position: absolute;
              top: 6px;
              width: 8px;
              height: 1.5px;
              background: rgba(255,255,255,0.78);
              transition: transform 0.18s ease;
            }

            .agreement-chevron::before {
              left: 0;
              transform: rotate(45deg);
            }

            .agreement-chevron::after {
              right: 0;
              transform: rotate(-45deg);
            }

            .agreement-item[open] .agreement-chevron::before {
              transform: rotate(-45deg);
            }

            .agreement-item[open] .agreement-chevron::after {
              transform: rotate(45deg);
            }

            .agreement-content {
              padding: 0 18px 18px;
              border-top: 1px solid rgba(255,255,255,0.07);
            }

            .agreement-content p {
              margin: 14px 0 0;
              color: var(--muted);
              font-size: 13px;
              line-height: 1.6;
            }

            .agreement-form {
              margin-top: 14px;
              padding: 18px;
              border-radius: 8px;
              border: 1px solid var(--panel-border);
              background: rgba(255,255,255,0.03);
            }

            .checkbox-row {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              color: rgba(255,255,255,0.78);
              font-size: 12px;
              line-height: 1.45;
            }

            .checkbox-row input {
              margin: 2px 0 0;
              width: 16px;
              height: 16px;
              accent-color: #e6cd9c;
            }

            .form-error {
              margin: 0 0 14px;
              padding: 12px 14px;
              border-radius: 8px;
              border: 1px solid rgba(232, 142, 142, 0.24);
              background: rgba(133, 29, 29, 0.18);
              color: #ffd5d5;
              font-size: 13px;
              line-height: 1.45;
            }

            .actions {
              margin-top: 18px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              flex-wrap: wrap;
            }

            .hint {
              color: rgba(255,255,255,0.40);
              font-size: 12px;
              line-height: 1.45;
            }

            .submit-button {
              min-width: 156px;
              padding: 14px 22px;
              border: 0;
              border-radius: 10px;
              background: var(--accent-surface);
              color: var(--accent-deep);
              font-size: 16px;
              line-height: 1;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 14px 28px rgba(0,0,0,0.24);
              transition: opacity 0.18s ease, transform 0.18s ease;
            }

            .submit-button:disabled {
              opacity: 0.45;
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
            }

            .footer {
              padding-top: 14px;
              color: rgba(255,255,255,0.32);
              font-size: 11px;
              line-height: 1.4;
              text-align: center;
            }

            @media (max-width: 640px) {
              body {
                padding: 12px;
              }

              .page {
                min-height: calc(100vh - 24px);
              }

              .header {
                padding: 22px 18px 18px;
              }

              .title {
                font-size: 20px;
              }

              .body {
                padding: 18px 16px 22px;
              }

              .agreement-summary {
                font-size: 14px;
              }

              .actions {
                align-items: stretch;
              }

              .submit-button {
                width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="shell">
              <div class="header">
                <h1 class="title">Service Agreement & Terms of Engagement</h1>
                <a class="close-link" href="${dashboardLink}" aria-label="Close">x</a>
              </div>

              <div class="body">
                <div class="summary-card">
                  <h2>Services Agreement</h2>
                  <p>${escapeHtml(summaryParagraph)}</p>
                </div>

                <div class="quote-ref">Quote Reference: ${escapeHtml(quoteNumber || 'Unavailable')}</div>

                <div class="agreement-list">
                  ${accordionMarkup}
                </div>

                <form class="agreement-form" method="POST" action="${escapeHtml(formAction)}">
                  <input type="hidden" name="token" value="${escapeHtml(token)}" />
                  ${errorMessage ? `<div class="form-error">${escapeHtml(errorMessage)}</div>` : ''}
                  <label class="checkbox-row" for="agreementAccepted">
                    <input id="agreementAccepted" name="agreement_accepted" type="checkbox" value="true" checked />
                    <span>I have read and agree to the Terms & Services Agreement.</span>
                  </label>

                  <div class="actions">
                    <div class="hint">You must keep this checked before continuing to final quote acceptance.</div>
                    <button id="acceptContinueButton" class="submit-button" type="submit">Accept & Continue</button>
                  </div>
                </form>

                <div class="footer">This is an automated Beige agreement confirmation page.</div>
              </div>
            </div>
          </div>

          <script>
            (function() {
              var checkbox = document.getElementById('agreementAccepted');
              var button = document.getElementById('acceptContinueButton');

              if (!checkbox || !button) {
                return;
              }

              function syncButton() {
                button.disabled = !checkbox.checked;
              }

              checkbox.addEventListener('change', syncButton);
              syncButton();
            })();
          </script>
        </body>
      </html>
    `
  };
}

module.exports = {
  renderQuoteAcceptPage,
  renderQuoteAgreementPage
};
