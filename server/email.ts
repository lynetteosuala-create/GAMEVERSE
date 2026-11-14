import nodemailer, { type Transporter } from 'nodemailer';

let cachedEtherealTransporter: Transporter | null = null;

async function getTransporter(): Promise<{
  transporter: Transporter;
  mode: 'smtp' | 'ethereal';
  from: string;
}> {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return {
      transporter,
      mode: 'smtp',
      from: process.env.SMTP_FROM || `GAMEVERSE <${process.env.SMTP_USER}>`,
    };
  }

  if (!cachedEtherealTransporter) {
    const testAccount = await nodemailer.createTestAccount();
    cachedEtherealTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return {
    transporter: cachedEtherealTransporter,
    mode: 'ethereal',
    from: process.env.SMTP_FROM || 'GAMEVERSE <noreply@gameverse.arena>',
  };
}

export async function sendVerificationEmail(params: {
  to: string;
  code: string;
  purpose: 'auth' | 'reset_password';
  username?: string;
}): Promise<{ delivered: boolean; mode: 'resend' | 'smtp' | 'ethereal' }> {
  const subject =
    params.purpose === 'reset_password'
      ? 'GAMEVERSE — Password Recovery Verification Code'
      : 'GAMEVERSE — Your Sign-In Verification Code';

  const heading =
    params.purpose === 'reset_password'
      ? 'Reset Your GAMEVERSE Password'
      : 'Welcome to GAMEVERSE';

  const intro =
    params.purpose === 'reset_password'
      ? 'Use the temporary 6-digit verification code below to reset your password.'
      : `Hi ${params.username || 'Player'}, enter the 6-digit verification code below to verify your email and enter GAMEVERSE.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0B1120; color: #F8FAFC; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #10B981; margin-bottom: 16px;">GAMEVERSE</div>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 12px; color: #FFFFFF;">${heading}</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #CBD5E1; margin: 0 0 24px;">${intro}</p>
      <div style="background: #131C31; border: 1px solid #1E293B; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 12px; color: #94A3B8; margin-bottom: 8px;">TEMPORARY VERIFICATION CODE</div>
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #FFFFFF;">${params.code}</div>
      </div>
      <p style="font-size: 13px; color: #94A3B8; margin: 0;">This code expires in 10 minutes. Never share this code with anyone.</p>
    </div>
  `;

  const text = `${heading}\n\n${intro}\n\nVerification Code: ${params.code}\n\nThis code expires in 10 minutes.`;

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || 'GAMEVERSE <onboarding@resend.dev>',
        to: [params.to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Email provider error: ${errBody}`);
    }

    return { delivered: true, mode: 'resend' };
  }

  const { transporter, mode, from } = await getTransporter();
  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject,
    text,
    html,
  });

  if (mode === 'ethereal') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.info(`[GAMEVERSE Email Relay] Ethereal message preview for ${params.to}: ${previewUrl}`);
    }
  }

  return { delivered: true, mode };
}
