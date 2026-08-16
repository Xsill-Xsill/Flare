import { Resend } from 'resend'

const DIGEST_FROM_EMAIL = process.env.DIGEST_FROM_EMAIL || 'Flare <digest@in.flare.app>'

let client: Resend | null = null

function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const resend = getClient()
  const { error } = await resend.emails.send({ from: DIGEST_FROM_EMAIL, to, subject, html })
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`)
  }
}
