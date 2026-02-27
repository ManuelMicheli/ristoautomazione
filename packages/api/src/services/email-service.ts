// ---------------------------------------------------------------------------
// Email Provider Interface
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailProvider {
  send(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Resend Provider (primary)
// ---------------------------------------------------------------------------

export class ResendProvider implements EmailProvider {
  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
  ): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) return false;

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.EMAIL_FROM || 'CPH <noreply@example.com>';

      await resend.emails.send({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });

      return true;
    } catch (err) {
      console.error('ResendProvider failed:', err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// SMTP Provider (fallback via nodemailer)
// ---------------------------------------------------------------------------

export class SmtpProvider implements EmailProvider {
  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
  ): Promise<boolean> {
    if (!process.env.SMTP_HOST) return false;

    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const from = process.env.SMTP_FROM || process.env.SMTP_USER;

      await transport.sendMail({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });

      return true;
    } catch (err) {
      console.error('SmtpProvider failed:', err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// EmailService — tries providers in order (failover chain)
// ---------------------------------------------------------------------------

export class EmailService {
  private providers: EmailProvider[];

  constructor(providers?: EmailProvider[]) {
    this.providers = providers || [
      new ResendProvider(),
      new SmtpProvider(),
    ];
  }

  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
  ): Promise<boolean> {
    for (const provider of this.providers) {
      try {
        const result = await provider.send(to, subject, html, attachments);
        if (result) return true;
      } catch {
        // Try next provider
      }
    }

    console.error('All email providers failed for:', to, subject);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email Templates (Italian)
// ---------------------------------------------------------------------------

export const emailTemplates = {
  orderApproval: (
    orderNumber: number,
    creator: string,
    amount: string,
  ) => ({
    subject: `CPH: Ordine #${orderNumber} richiede approvazione`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Richiesta di approvazione ordine</h2>
        <p>L'utente <strong>${creator}</strong> ha creato l'ordine <strong>#${orderNumber}</strong> per un totale di <strong>${amount}</strong>.</p>
        <p>Accedi alla piattaforma per approvare o rifiutare.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Central Procurement Hub - Notifica automatica</p>
      </div>
    `,
  }),

  invoiceDiscrepancy: (
    invoiceNumber: string,
    supplier: string,
    amount: string,
  ) => ({
    subject: `CPH: Discrepanza fattura ${invoiceNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Discrepanza rilevata</h2>
        <p>La fattura <strong>${invoiceNumber}</strong> di <strong>${supplier}</strong> presenta una discrepanza di <strong>${amount}</strong>.</p>
        <p>Verifica sulla piattaforma.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Central Procurement Hub - Notifica automatica</p>
      </div>
    `,
  }),

  documentExpiry: (count: number) => ({
    subject: `CPH: ${count} documenti in scadenza`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Documenti in scadenza</h2>
        <p><strong>${count}</strong> documenti fornitore sono in scadenza nei prossimi 30 giorni.</p>
        <p>Verifica sulla piattaforma.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Central Procurement Hub - Notifica automatica</p>
      </div>
    `,
  }),

  nonConformityAlert: (
    supplierName: string,
    productName: string,
    type: string,
    severity: string,
  ) => ({
    subject: `CPH: Non conformita ${severity} - ${supplierName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Non conformita rilevata</h2>
        <p>Fornitore: <strong>${supplierName}</strong></p>
        <p>Prodotto: <strong>${productName}</strong></p>
        <p>Tipo: <strong>${type}</strong></p>
        <p>Gravita: <strong>${severity}</strong></p>
        <p>Verifica sulla piattaforma.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Central Procurement Hub - Notifica automatica</p>
      </div>
    `,
  }),

  scoreAlert: (
    supplierName: string,
    compositeScore: number,
    threshold: number,
  ) => ({
    subject: `CPH: Punteggio fornitore sotto soglia - ${supplierName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Punteggio fornitore sotto soglia</h2>
        <p>Il fornitore <strong>${supplierName}</strong> ha un punteggio complessivo di <strong>${compositeScore.toFixed(1)}</strong>, sotto la soglia di <strong>${threshold}</strong>.</p>
        <p>Verifica sulla piattaforma.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Central Procurement Hub - Notifica automatica</p>
      </div>
    `,
  }),
};
