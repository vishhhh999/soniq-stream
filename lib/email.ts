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