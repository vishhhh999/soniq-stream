import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(to: string, code: string) {
  const { error } = await resend.emails.send({
    from: "Soniq Stream <onboarding@soniq.lol>",
    to,
    subject: `Your verification code: ${code}`,
    html: `<p>Your code is <strong>${code}</strong>. It expires in 10 minutes.</p><p>If you didn't request this, you can ignore this email.</p>`,
  });

  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}

// Contact form submissions from /contact — forwarded to a fixed inbox, not
// stored anywhere. replyTo is set to the sender's own address so replying
// to the forwarded email goes straight back to them.
export async function sendContactEmail(params: { name: string; email: string; message: string }) {
  const { name, email, message } = params;
  const { error } = await resend.emails.send({
    from: "Soniq Contact Form <onboarding@soniq.lol>",
    to: process.env.CONTACT_INBOX_EMAIL || "hello@soniq.lol",
    replyTo: email,
    subject: `New contact form message from ${name}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message.replace(/\n/g, "<br>")}</p>`,
  });

  if (error) {
    throw new Error(`Failed to send contact email: ${error.message}`);
  }
}