import nodemailer from "nodemailer";

import { env } from "@/server/env";

const EMAIL_TIMEOUT_MS = 15_000;

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
};

export type EmailProvider = "smtp" | "resend" | "postmark";

export type EmailSendResult = {
  provider: EmailProvider;
  messageId: string;
};

export type EmailDeliveryFailure = {
  code: string;
  transient: boolean;
  ambiguous: boolean;
};

export class EmailDeliveryError extends Error {
  readonly code: string;
  readonly transient: boolean;
  readonly ambiguous: boolean;

  constructor(message: string, failure: EmailDeliveryFailure) {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = failure.code;
    this.transient = failure.transient;
    this.ambiguous = failure.ambiguous;
  }
}

export const getEmailDeliveryFailure = (
  error: unknown,
): EmailDeliveryFailure => {
  if (error instanceof EmailDeliveryError) {
    return {
      code: error.code,
      transient: error.transient,
      ambiguous: error.ambiguous,
    };
  }

  return {
    code: "EMAIL_UNEXPECTED_FAILURE",
    transient: true,
    ambiguous: false,
  };
};

const getRecipient = (value: EmailPayload["to"]) => {
  const recipients = Array.isArray(value) ? value : [value];
  const recipient = recipients[0]?.trim();

  if (
    recipients.length !== 1 ||
    !recipient ||
    !/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(recipient)
  ) {
    throw new EmailDeliveryError("Exactly one email recipient is required.", {
      code: "EMAIL_RECIPIENT_INVALID",
      transient: false,
      ambiguous: false,
    });
  }

  return recipient;
};

const getIdempotencyKey = (value: string | undefined) => {
  if (value === undefined) return undefined;

  const key = value.trim();
  if (!key || key.length > 256 || /[\r\n]/.test(key)) {
    throw new EmailDeliveryError("Email idempotency key is invalid.", {
      code: "EMAIL_IDEMPOTENCY_KEY_INVALID",
      transient: false,
      ambiguous: false,
    });
  }

  return key;
};

const validateContent = (payload: EmailPayload) => {
  if (
    !payload.subject.trim() ||
    /[\r\n]/.test(payload.subject) ||
    !payload.html.trim()
  ) {
    throw new EmailDeliveryError("Email subject or HTML content is invalid.", {
      code: "EMAIL_CONTENT_INVALID",
      transient: false,
      ambiguous: false,
    });
  }
};

const getConfiguredProvider = (): EmailProvider => {
  const smtpValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASSWORD];
  const hasAnySmtpValue = smtpValues.some(Boolean);
  const hasCompleteSmtpConfig = smtpValues.every(Boolean);

  if (hasAnySmtpValue && !hasCompleteSmtpConfig) {
    throw new EmailDeliveryError("SMTP configuration is incomplete.", {
      code: "EMAIL_PROVIDER_CONFIG_INCOMPLETE",
      transient: false,
      ambiguous: false,
    });
  }

  const providers: EmailProvider[] = [];
  if (hasCompleteSmtpConfig) providers.push("smtp");
  if (env.RESEND_API_KEY) providers.push("resend");
  if (env.POSTMARK_API_KEY) providers.push("postmark");

  if (providers.length === 0) {
    throw new EmailDeliveryError("No email provider is configured.", {
      code: "EMAIL_PROVIDER_MISSING",
      transient: false,
      ambiguous: false,
    });
  }

  if (providers.length > 1) {
    throw new EmailDeliveryError(
      "More than one email provider is configured.",
      {
        code: "EMAIL_PROVIDER_AMBIGUOUS",
        transient: false,
        ambiguous: false,
      },
    );
  }

  if (!env.EMAIL_FROM || /[\r\n]/.test(env.EMAIL_FROM)) {
    throw new EmailDeliveryError("A valid EMAIL_FROM value is required.", {
      code: "EMAIL_FROM_MISSING",
      transient: false,
      ambiguous: false,
    });
  }

  return providers[0];
};

const classifySmtpFailure = (error: unknown) => {
  if (error instanceof EmailDeliveryError) return error;

  const details = error as { code?: unknown; responseCode?: unknown };
  const code = typeof details?.code === "string" ? details.code : "";
  const responseCode =
    typeof details?.responseCode === "number" ? details.responseCode : 0;

  if (code === "ETIMEDOUT") {
    return new EmailDeliveryError(
      "SMTP delivery timed out with an unknown outcome.",
      {
        code: "EMAIL_SMTP_TIMEOUT_AMBIGUOUS",
        transient: false,
        ambiguous: true,
      },
    );
  }

  if (responseCode >= 400 && responseCode < 500) {
    return new EmailDeliveryError(
      "SMTP provider reported a temporary failure.",
      {
        code: "EMAIL_PROVIDER_TEMPORARY",
        transient: true,
        ambiguous: false,
      },
    );
  }

  if (["ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS"].includes(code)) {
    return new EmailDeliveryError("SMTP connection failed temporarily.", {
      code: "EMAIL_PROVIDER_TEMPORARY",
      transient: true,
      ambiguous: false,
    });
  }

  return new EmailDeliveryError("SMTP provider rejected the message.", {
    code: "EMAIL_PROVIDER_REJECTED",
    transient: false,
    ambiguous: false,
  });
};

const sendWithSmtp = async (
  payload: EmailPayload,
  recipient: string,
): Promise<EmailSendResult> => {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASSWORD!,
    },
  });

  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        transport.close();
        reject(
          new EmailDeliveryError(
            "SMTP delivery timed out with an unknown outcome.",
            {
              code: "EMAIL_SMTP_TIMEOUT_AMBIGUOUS",
              transient: false,
              ambiguous: true,
            },
          ),
        );
      }, EMAIL_TIMEOUT_MS);
    });

    const result = await Promise.race([
      transport.sendMail({
        from: env.EMAIL_FROM!,
        to: recipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      timeoutPromise,
    ]);

    const accepted = Array.isArray(result.accepted) ? result.accepted : [];
    const rejected = Array.isArray(result.rejected) ? result.rejected : [];
    if (
      rejected.length > 0 ||
      (Array.isArray(result.accepted) && accepted.length === 0)
    ) {
      throw new EmailDeliveryError("SMTP provider rejected the recipient.", {
        code: "EMAIL_PROVIDER_REJECTED",
        transient: false,
        ambiguous: false,
      });
    }

    if (typeof result.messageId !== "string" || !result.messageId) {
      throw new EmailDeliveryError(
        "SMTP provider returned no message identifier.",
        {
          code: "EMAIL_PROVIDER_RESPONSE_INVALID",
          transient: false,
          ambiguous: true,
        },
      );
    }

    return { provider: "smtp", messageId: result.messageId };
  } catch (error) {
    throw classifySmtpFailure(error);
  } finally {
    if (timeout) clearTimeout(timeout);
    transport.close();
  }
};

const fetchEmailProviderJson = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const transient =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;

      throw new EmailDeliveryError("Email provider rejected the request.", {
        code: transient
          ? "EMAIL_PROVIDER_TEMPORARY"
          : "EMAIL_PROVIDER_REJECTED",
        transient,
        ambiguous: false,
      });
    }

    try {
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new EmailDeliveryError(
        "Email provider returned an invalid response.",
        {
          code: "EMAIL_PROVIDER_RESPONSE_INVALID",
          transient: false,
          ambiguous: true,
        },
      );
    }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;

    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new EmailDeliveryError("Email provider request timed out.", {
        code: "EMAIL_PROVIDER_TIMEOUT",
        transient: true,
        ambiguous: false,
      });
    }

    throw new EmailDeliveryError("Email provider request failed temporarily.", {
      code: "EMAIL_PROVIDER_TEMPORARY",
      transient: true,
      ambiguous: false,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const sendWithResend = async (
  payload: EmailPayload,
  recipient: string,
  idempotencyKey: string | undefined,
): Promise<EmailSendResult> => {
  const result = await fetchEmailProviderJson("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: recipient,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (typeof result.id !== "string" || !result.id) {
    throw new EmailDeliveryError("Resend returned no message identifier.", {
      code: "EMAIL_PROVIDER_RESPONSE_INVALID",
      transient: false,
      ambiguous: true,
    });
  }

  return { provider: "resend", messageId: result.id };
};

const sendWithPostmark = async (
  payload: EmailPayload,
  recipient: string,
): Promise<EmailSendResult> => {
  const result = await fetchEmailProviderJson(
    "https://api.postmarkapp.com/email",
    {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": env.POSTMARK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: recipient,
        Subject: payload.subject,
        HtmlBody: payload.html,
        TextBody: payload.text,
      }),
    },
  );

  if (typeof result.MessageID !== "string" || !result.MessageID) {
    throw new EmailDeliveryError("Postmark returned no message identifier.", {
      code: "EMAIL_PROVIDER_RESPONSE_INVALID",
      transient: false,
      ambiguous: true,
    });
  }

  return { provider: "postmark", messageId: result.MessageID };
};

export const sendEmail = async (
  payload: EmailPayload,
): Promise<EmailSendResult> => {
  const recipient = getRecipient(payload.to);
  const idempotencyKey = getIdempotencyKey(payload.idempotencyKey);
  validateContent(payload);
  const provider = getConfiguredProvider();

  if (provider === "smtp") return sendWithSmtp(payload, recipient);
  if (provider === "resend")
    return sendWithResend(payload, recipient, idempotencyKey);
  return sendWithPostmark(payload, recipient);
};
