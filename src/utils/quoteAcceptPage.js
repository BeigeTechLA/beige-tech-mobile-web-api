const constants = require('./constants');


function renderQuoteAcceptPage({
  title,
  badge,
  description,
  quoteNumber = '',
  tone = 'success',
  statusCode = constants.OK.code
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

  const ctaLabel = tone === 'error'
    ? 'CONTACT SALES'
    : tone === 'warning'
      ? 'OPEN DASHBOARD'
      : 'SIGN UP TO DASHBOARD';

  const ctaHref = tone === 'error'
    ? 'mailto:sales@beigecorporation.io'
    : tone === 'success'
      ? `${dashboardLink}/signup/user`
      : dashboardLink;

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
            }

            .icon-core {
              position: absolute;
              left: 50%;
              top: 35px;
              transform: translateX(-50%);
              width: 64px;
              height: 64px;
              border-radius: 50%;
              background: ${palette.iconBg};
              color: #111111;
              font-size: 40px;
              line-height: 64px;
              font-weight: 700;
              text-align: center;
              box-shadow: 0 10px 26px rgba(0,0,0,0.24);
            }

            .confetti {
              position: absolute;
              width: 7px;
              height: 7px;
              border-radius: 2px;
              opacity: 0.95;
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
                    <div class="icon-core">${statusIcon}</div>

                    <span class="confetti" style="left:28px;top:72px;background:#4D82FF;transform:rotate(18deg);"></span>
                    <span class="confetti" style="left:31px;top:51px;background:#5FD68F;border-radius:50%;"></span>
                    <span class="confetti" style="left:53px;top:28px;background:#EA745F;transform:rotate(42deg);"></span>
                    <span class="confetti" style="left:104px;top:39px;background:#4D82FF;transform:rotate(28deg);"></span>
                    <span class="confetti" style="left:116px;top:62px;background:#E3BF61;border-radius:50%;"></span>
                    <span class="confetti" style="left:107px;top:91px;background:#EA745F;transform:rotate(28deg);"></span>
                    <span class="confetti" style="left:32px;top:91px;background:#E3BF61;transform:rotate(36deg);"></span>
                    <span class="confetti" style="left:91px;top:111px;background:#5FD68F;border-radius:50%;"></span>
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

module.exports = {
  renderQuoteAcceptPage
};
