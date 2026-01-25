import nodemailer from "nodemailer";

import { env } from "@/server/env";

type EmailPayload = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
};

export const sendEmail = async (payload: EmailPayload) => {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    if (!env.EMAIL_FROM) {
      throw new Error("EMAIL_FROM is required when using SMTP.");
    }

    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });

    return transport.sendMail({
      from: env.EMAIL_FROM,
      to: payload.to.join(","),
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend error: ${text}`);
    }

    return response.json();
  }

  if (env.POSTMARK_API_KEY) {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": env.POSTMARK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: payload.to.join(","),
        Subject: payload.subject,
        HtmlBody: payload.html,
        TextBody: payload.text,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Postmark error: ${text}`);
    }

    return response.json();
  }

  return { skipped: true, reason: "No email provider configured." };
};
