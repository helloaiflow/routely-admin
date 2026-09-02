/* Internal Package notifications — email/SMS integration point.
 *
 * TEMPLATES ARE READY (email-templates.ts): senderConfirmationEmailHtml and
 * recipientNotificationEmailHtml render the two premium transactional emails
 * (CEO spec, 2026-09-02). What is still missing is a SEND channel — the
 * client app has no SMTP/SES credentials; wiring goes through the VPS
 * (FastAPI or the n8n webhook pattern used by create-order). Until that
 * lands, this queues nothing and NEVER blocks creation (CEO: "si no están
 * listas, dejar la integración preparada sin bloquear").
 */

import {
  recipientNotificationEmailHtml,
  senderConfirmationEmailHtml,
  type InternalPackageEmailData,
} from "./email-templates";

export type InternalPackageNotification = {
  trackingId: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  senderName: string | null;
  senderEmail: string | null;
  fromOffice: string | null;
  deliveryAddress?: string | null;
  contents?: string | null;
};

export function queueInternalPackageNotifications(n: InternalPackageNotification): void {
  try {
    const data: InternalPackageEmailData = {
      trackingId: n.trackingId,
      recipientName: n.recipientName,
      deliveryAddress: n.deliveryAddress ?? "",
      senderName: n.senderName,
      fromOffice: n.fromOffice,
      contents: n.contents ?? null,
    };
    // Rendered and ready — swap these consts for the send call when the
    // channel exists. Kept referenced so the templates stay type-checked.
    const senderHtml = n.senderEmail ? senderConfirmationEmailHtml(data) : null;
    const recipientHtml = n.recipientEmail ? recipientNotificationEmailHtml(data) : null;
    void senderHtml;
    void recipientHtml;
    // TODO(next VPS mission): POST { to, subject, html } to the send channel.
  } catch {
    // Notifications are best-effort by contract — never surface, never block.
  }
}
