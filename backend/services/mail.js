// Transactional e-mail through Brevo's HTTPS API. SMTP is not used because the free hosting
// tier blocks outbound SMTP ports. Without BREVO_API_KEY and MAIL_FROM the feature is off.
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10000;

export const mailConfigured = () =>
  Boolean(process.env.BREVO_API_KEY?.trim() && process.env.MAIL_FROM?.trim());

async function brevo({ to, subject, text, html }) {
  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY.trim(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM.trim(), name: process.env.MAIL_FROM_NAME || 'SRGOP' },
      to: [to],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  // The body is not logged: it may echo the recipient.
  if (!response.ok) throw new Error(`Serviço de e-mail respondeu ${response.status}.`);
}

let transport = brevo;
/** Tests replace the transport so nothing is sent; `null` restores the real one. */
export const setMailTransport = (fn) => {
  transport = fn || brevo;
};

/** `to` is `{ email, name }`. Throws when the provider refuses or does not answer. */
export async function sendMail(message) {
  if (!mailConfigured()) throw new Error('Envio de e-mail não configurado.');
  await transport(message);
}
