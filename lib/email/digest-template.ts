export type DigestInsight = {
  title: string
  summary: string
  evidenceTitles: string[]
}

const APP_URL = process.env.APP_URL || 'https://app.flare.app'
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInsightBlock(insight: DigestInsight): string {
  const evidenceList =
    insight.evidenceTitles.length > 0
      ? `<ul style="margin: 0; padding: 0; list-style: none;">
          ${insight.evidenceTitles
            .map(
              (title) => `<li style="margin: 0 0 4px 0; font-size: 13px; color: #5C6F65; font-family: ${FONT_STACK};">
                <span style="color: #0D9F6E;">&bull;</span> ${escapeHtml(title)}
              </li>`
            )
            .join('')}
        </ul>`
      : ''

  return `
    <tr>
      <td style="padding: 0 0 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #1A2620; font-family: ${FONT_STACK};">
          ${escapeHtml(insight.title)}
        </p>
        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #3d4a42; font-family: ${FONT_STACK};">
          ${escapeHtml(insight.summary)}
        </p>
        ${evidenceList}
      </td>
    </tr>`
}

export function renderDigestEmail(insights: DigestInsight[]): { subject: string; html: string } {
  const subject = `${insights.length} new insight${insights.length === 1 ? '' : 's'} in Flare`
  const insightBlocks = insights.map(renderInsightBlock).join('')

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #F7F9F8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #F7F9F8; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #ffffff; border-radius: 12px; padding: 32px;">
            <tr>
              <td style="padding: 0 0 24px 0;">
                <p style="margin: 0; font-size: 20px; font-weight: 800; color: #1A2620; font-family: ${FONT_STACK};">
                  Flare &middot; Today&rsquo;s insights
                </p>
              </td>
            </tr>
            ${insightBlocks}
            <tr>
              <td style="padding-top: 8px; border-top: 1px solid #D8E2DC;">
                <p style="margin: 16px 0 0 0; font-size: 13px; font-family: ${FONT_STACK};">
                  <a href="${APP_URL}/insights" style="color: #0D9F6E; text-decoration: none; font-weight: 600;">Open Flare</a>
                  &nbsp;&middot;&nbsp;
                  <a href="mailto:unsubscribe@in.flare.app?subject=Unsubscribe" style="color: #5C6F65; text-decoration: none;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html }
}
