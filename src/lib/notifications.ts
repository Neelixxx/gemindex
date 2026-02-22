import { Resend } from "resend";

import { nextId, withDbMutation } from "./db";
import { logger } from "./logger";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Gem Index <no-reply@gemindex.local>";
}

export async function queueEmail(params: {
  userId?: string;
  to: string;
  subject: string;
  template: "VERIFY_EMAIL" | "PASSWORD_RESET";
  body: string;
}): Promise<void> {
  const id = nextId("mail");

  await withDbMutation((db) => {
    db.emailOutbox.push({
      id,
      userId: params.userId,
      to: params.to,
      subject: params.subject,
      template: params.template,
      body: params.body,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
  });

  const resend = getResend();
  if (!resend) {
    await withDbMutation((db) => {
      const row = db.emailOutbox.find((entry) => entry.id === id);
      if (!row) {
        return;
      }
      row.status = "SENT";
      row.sentAt = new Date().toISOString();
      row.error = "DEV_NO_PROVIDER";
    });
    return;
  }

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.body,
    });

    await withDbMutation((db) => {
      const row = db.emailOutbox.find((entry) => entry.id === id);
      if (!row) {
        return;
      }
      row.status = "SENT";
      row.sentAt = new Date().toISOString();
      row.error = undefined;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    logger.error({ error: message, to: params.to }, "email send failed");

    await withDbMutation((db) => {
      const row = db.emailOutbox.find((entry) => entry.id === id);
      if (!row) {
        return;
      }
      row.status = "FAILED";
      row.error = message;
    });
  }
}
