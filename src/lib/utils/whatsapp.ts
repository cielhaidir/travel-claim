/**
 * WhatsApp poll notification helper.
 *
 * Sends a poll (vote) via the configured WhatsApp gateway using basic-auth.
 * All configuration is read from environment variables:
 *   WHATSAPP_BASE_URL    – base URL of the WA gateway (e.g. https://wa.example.com)
 *   WHATSAPP_DEVICE_ID   – device/session ID sent as the "Device-Id" header
 *   WHATSAPP_BASIC_AUTH  – "username:password" string (base64-encoded at runtime)
 *
 * When any of those vars is absent the call is silently skipped so that the
 * app still works in environments that have not configured the gateway yet.
 */

import { env } from "@/env";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("whatsapp");

export interface SendPollParams {
  /** WhatsApp number including suffix, e.g. "6289685024421@s.whatsapp.net" */
  phone: string;
  /** Poll question / caption shown above the options */
  question: string;
  /** Poll answer options */
  options: string[];
  /** Maximum selections allowed (default 1) */
  maxAnswer?: number;
}

export interface SendPollResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SendMessageParams {
  /** WhatsApp number including suffix, e.g. "6289685024421@s.whatsapp.net" */
  phone: string;
  /** Message text to send */
  message: string;
  /** Message ID to reply to (optional) */
  reply_message_id?: string;
  /** Whether this is a forwarded message (optional) */
  is_forwarded?: boolean;
  /** Disappearing message duration in seconds (optional) */
  duration?: number;
  /**
   * List of phone numbers to mention (ghost mentions).
   * Use "@everyone" to mention all group participants.
   */
  mentions?: string[];
}

export interface SendMessageResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Send a WhatsApp text message.
 *
 * Errors are caught and returned as `{ ok: false, error }` so that a failed
 * notification never causes the parent database transaction to roll back.
 */
export async function sendWhatsappMessage(
  params: SendMessageParams,
): Promise<SendMessageResult> {
  const { WHATSAPP_BASE_URL, WHATSAPP_DEVICE_ID, WHATSAPP_BASIC_AUTH } = env;

  // Silently skip when gateway is not configured
  if (!WHATSAPP_BASE_URL || !WHATSAPP_DEVICE_ID || !WHATSAPP_BASIC_AUTH) {
    log.warn("WhatsApp gateway not configured – skipping message send", {
      phone: params.phone,
    });
    return { ok: true, skipped: true };
  }

  const encodedAuth = Buffer.from(WHATSAPP_BASIC_AUTH).toString("base64");

  log.info("Sending WhatsApp message", {
    phone: params.phone,
    message: params.message,
  });

  try {
    const res = await fetch(`${WHATSAPP_BASE_URL}/send/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedAuth}`,
        "Device-Id": WHATSAPP_DEVICE_ID,
      },
      body: JSON.stringify({
        phone: params.phone,
        message: params.message,
        ...(params.reply_message_id !== undefined && {
          reply_message_id: params.reply_message_id,
        }),
        ...(params.is_forwarded !== undefined && {
          is_forwarded: params.is_forwarded,
        }),
        ...(params.duration !== undefined && { duration: params.duration }),
        ...(params.mentions !== undefined && { mentions: params.mentions }),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      const errorMsg = `WhatsApp gateway returned ${res.status}: ${body}`;
      log.error("WhatsApp message send failed – gateway error", {
        phone: params.phone,
        status: res.status,
        body,
      });
      return { ok: false, error: errorMsg };
    }

    log.info("WhatsApp message sent successfully", { phone: params.phone });
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("WhatsApp message send failed – network/unexpected error", {
      phone: params.phone,
      error: errorMsg,
    });
    return { ok: false, error: errorMsg };
  }
}

/**
 * Send a WhatsApp poll notification.
 *
 * Errors are caught and returned as `{ ok: false, error }` so that a failed
 * notification never causes the parent database transaction to roll back.
 */
export async function sendWhatsappPoll(
  params: SendPollParams,
): Promise<SendPollResult> {
  const { WHATSAPP_BASE_URL, WHATSAPP_DEVICE_ID, WHATSAPP_BASIC_AUTH } = env;

  // Silently skip when gateway is not configured
  if (!WHATSAPP_BASE_URL || !WHATSAPP_DEVICE_ID || !WHATSAPP_BASIC_AUTH) {
    log.warn("WhatsApp gateway not configured – skipping poll send", {
      phone: params.phone,
      question: params.question,
    });
    return { ok: true, skipped: true };
  }

  const encodedAuth = Buffer.from(WHATSAPP_BASIC_AUTH).toString("base64");

  log.info("Sending WhatsApp poll", {
    phone: params.phone,
    question: params.question,
    options: params.options,
    maxAnswer: params.maxAnswer ?? 1,
  });

  try {
    const res = await fetch(`${WHATSAPP_BASE_URL}/send/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedAuth}`,
        "Device-Id": WHATSAPP_DEVICE_ID,
      },
      body: JSON.stringify({
        phone: params.phone,
        question: params.question,
        options: params.options,
        max_answer: params.maxAnswer ?? 1,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      const errorMsg = `WhatsApp gateway returned ${res.status}: ${body}`;
      log.error("WhatsApp poll send failed – gateway error", {
        phone: params.phone,
        status: res.status,
        body,
      });
      return { ok: false, error: errorMsg };
    }

    log.info("WhatsApp poll sent successfully", { phone: params.phone });
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("WhatsApp poll send failed – network/unexpected error", {
      phone: params.phone,
      error: errorMsg,
    });
    return { ok: false, error: errorMsg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a WhatsApp poll for a TravelRequest approval.
 *
 * @param approvalNumber   e.g. "APR-2026-00001"
 * @param approverPhone    approver's WA number WITHOUT the suffix (e.g. "6289685024421")
 * @param detail           human-readable detail line shown below the header
 */
export function buildTravelRequestApprovalPoll(
  approvalNumber: string,
  approverPhone: string,
  detail: {
    requestNumber: string;
    requesterName: string;
    destination: string;
    purpose: string;
    startDate: Date | string;
    endDate: Date | string;
  },
): SendPollParams {
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const question =
    `📋 *Approval Diperlukan*\n` +
    `No: ${detail.requestNumber}\n` +
    `Approval: ${approvalNumber}\n` +
    `Pemohon: ${detail.requesterName}\n` +
    `Tujuan: ${detail.destination}\n` +
    `Keperluan: ${detail.purpose}\n` +
    `Tanggal: ${fmt(detail.startDate)} – ${fmt(detail.endDate)}`;

  return {
    phone: `${approverPhone}@s.whatsapp.net`,
    question,
    options: [
      `Approve ${approvalNumber}`,
      `Decline ${approvalNumber}`,
      `Revision ${approvalNumber}`,
    ],
    maxAnswer: 1,
  };
}

/**
 * Build a WhatsApp poll for a Claim approval.
 */
export function buildClaimApprovalPoll(
  approvalNumber: string,
  approverPhone: string,
  detail: {
    claimNumber: string;
    submitterName: string;
    claimType: string;
    // Prisma Decimal serialises to string via .toString() — accept any shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    amount: any;
    description: string;
    travelRequestNumber?: string;
  },
): SendPollParams {
  const amount = Number(detail.amount).toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  const question =
    `🧾 *Approval Claim Diperlukan*\n` +
    `No Claim: ${detail.claimNumber}\n` +
    `Approval: ${approvalNumber}\n` +
    `Submitter: ${detail.submitterName}\n` +
    `Tipe: ${detail.claimType}\n` +
    `Jumlah: ${amount}\n` +
    `Keterangan: ${detail.description}` +
    (detail.travelRequestNumber
      ? `\nTravel Request: ${detail.travelRequestNumber}`
      : "");

  return {
    phone: `${approverPhone}@s.whatsapp.net`,
    question,
    options: [
      `Approve ${approvalNumber}`,
      `Decline ${approvalNumber}`,
      `Revision ${approvalNumber}`,
    ],
    maxAnswer: 1,
  };
}
