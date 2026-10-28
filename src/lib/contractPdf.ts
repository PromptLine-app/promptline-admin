import { jsPDF } from 'jspdf';
import type { TenantContract } from '@/types/domain';
import { PROMPTLINE_LOGO_BASE64 } from './logoBase64';

// ── Palette (matching exact design) ──────────────────────────────────
const NAVY: [number, number, number] = [23, 37, 84];        // #172554 Title & headings
const DARK_NAVY: [number, number, number] = [15, 30, 80];    // #0F1E50 Table header, accent bars
const GOLD: [number, number, number] = [180, 140, 50];       // #B48C32 Tags, section underlines
const SLATE_DARK: [number, number, number] = [15, 23, 42];   // #0F172A Main text & values
const SLATE_BODY: [number, number, number] = [51, 65, 85];   // #334155 Body copy & clauses
const SLATE_MUTED: [number, number, number] = [100, 116, 139]; // #64748B Secondary labels & dates
const SLATE_LIGHT: [number, number, number] = [148, 163, 184]; // #94A3B8 Footer
const BORDER_COLOR: [number, number, number] = [226, 217, 204]; // #E2D9CC Card & row borders

// ── Helpers ──────────────────────────────────────────────────────────
const formatUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const capitalize = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

export function generateContractPdf(contract: TenantContract): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const MARGIN_L = 18;
  const MARGIN_R = 192;
  const CONTENT_W = MARGIN_R - MARGIN_L; // 174mm

  // ── Header drawer ─────────────────────────────────────────────────
  const drawHeader = () => {
    // PromptLine Logo Icon
    try {
      doc.addImage(PROMPTLINE_LOGO_BASE64, 'PNG', 18, 10.5, 6.8, 7.7);
    } catch {
      // fallback if logo fails
    }

    // Wordmark 'PromptLine'
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...SLATE_DARK);
    doc.text('PromptLine', 26.5, 16.8);

    // Right provider info & agreement #
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(
      'Theoremlabs Partners LLC | 101 S. Tryon St, STE 2700, Charlotte, NC 28280',
      MARGIN_R,
      14,
      { align: 'right' }
    );
    doc.text(`Agreement ${contract.agreement_number}`, MARGIN_R, 18, {
      align: 'right',
    });

    // Top dividing bar
    doc.setDrawColor(...DARK_NAVY);
    doc.setLineWidth(0.6);
    doc.line(MARGIN_L, 22.5, MARGIN_R, 22.5);
  };

  // ── Footer drawer ─────────────────────────────────────────────────
  const drawFooter = (pageNum: number, totalPages: number) => {
    const y = 286;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_LIGHT);
    const statusText =
      contract.status === 'signed'
        ? 'SIGNED'
        : 'UNSIGNED - Signature not verified';
    doc.text(
      `${contract.agreement_number} | Template v1.0 | ${statusText}`,
      MARGIN_L,
      y
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, MARGIN_R, y, {
      align: 'right',
    });
  };

  // ==================================================================
  // PAGE 1
  // ==================================================================
  drawHeader();

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...NAVY);
  doc.text('SaaS Recurring Services Agreement', MARGIN_L, 31.5);

  // Subtitle / Dates
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(
    `Agreement date ${contract.agreement_date}  |  Service start ${contract.service_start_date}`,
    MARGIN_L,
    37
  );

  // Section: Parties
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...NAVY);
  doc.text('Parties', MARGIN_L, 44);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_L, 45.8, 31, 45.8);

  // Boxes
  const boxY = 48.5;
  const boxH = 26;
  const boxW = 84;

  // Provider Box (Left)
  doc.setFillColor(250, 248, 245);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_L, boxY, boxW, boxH, 1.5, 1.5, 'FD');
  doc.setFillColor(...DARK_NAVY);
  doc.rect(MARGIN_L, boxY, 2.5, boxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('PROVIDER', 23.5, boxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DARK);
  doc.text('Theoremlabs Partners LLC', 23.5, boxY + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_BODY);
  doc.text('101 S. Tryon St, STE 2700', 23.5, boxY + 15.5);
  doc.text('Charlotte, NC 28280', 23.5, boxY + 20);

  // Customer Box (Right)
  const rBoxX = 108;
  doc.setFillColor(250, 248, 245);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(rBoxX, boxY, boxW, boxH, 1.5, 1.5, 'FD');
  doc.setFillColor(...DARK_NAVY);
  doc.rect(rBoxX, boxY, 2.5, boxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('CUSTOMER', rBoxX + 5.5, boxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DARK);
  const custNameLines = doc.splitTextToSize(
    contract.legal_business_name,
    boxW - 8
  );
  doc.text(custNameLines[0], rBoxX + 5.5, boxY + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_BODY);
  const addrParts = [
    contract.billing_address,
    contract.state,
    contract.country,
  ].filter(Boolean);
  doc.text(addrParts.join(', '), rBoxX + 5.5, boxY + 15.5);

  const contactParts = [
    contract.primary_contact_name,
    contract.primary_contact_email,
    contract.primary_contact_phone,
  ].filter(Boolean);
  doc.text(contactParts.join('  |  '), rBoxX + 5.5, boxY + 20);

  // Section: Order Summary
  const osY = 80.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...NAVY);
  doc.text('Order Summary', MARGIN_L, osY);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_L, osY + 1.8, 45, osY + 1.8);

  // Table Header
  const tY = osY + 4.5;
  doc.setFillColor(...DARK_NAVY);
  doc.rect(MARGIN_L, tY, CONTENT_W, 6.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ITEM', 21, tY + 4.2);
  doc.text('AMOUNT / TERMS', 189, tY + 4.2, { align: 'right' });

  // Rows definition
  const commitmentStr =
    contract.commitment_months > 1
      ? `${contract.commitment_months}-month commitment`
      : 'Month-to-month';

  const rows: {
    item: string;
    terms: string;
    highlight?: 'recur' | 'total';
  }[] = [
    { item: 'Plan', terms: capitalize(contract.plan_tier) },
    {
      item: 'Billing cadence',
      terms:
        contract.billing_cadence === 'annual_prepaid'
          ? 'Annual prepaid'
          : 'Monthly',
    },
    { item: 'Commitment', terms: commitmentStr },
    {
      item: 'Base subscription rate',
      terms: `${formatUsd(contract.base_rate_cents)} / month`,
    },
  ];

  const discountCents = Math.round(
    contract.base_rate_cents * (contract.discount_percent / 100)
  );
  if (discountCents > 0) {
    const dLabel = contract.discount_label
      ? `Discount (${contract.discount_label})`
      : `Discount (${contract.discount_percent}%)`;
    rows.push({
      item: dLabel,
      terms: `-${formatUsd(discountCents)} / month`,
    });
  }

  rows.push({
    item: 'Net subscription rate',
    terms: `${formatUsd(contract.net_rate_cents)} / month`,
  });

  rows.push({
    item: 'Recurring monthly rate',
    terms: `${formatUsd(contract.net_rate_cents)} / month`,
    highlight: 'recur',
  });

  rows.push({
    item: 'Included billable calls',
    terms: `${contract.included_calls.toLocaleString('en-US')} per billing month`,
  });

  rows.push({
    item: 'Overage rate',
    terms: `${formatUsd(contract.overage_rate_cents)} per additional billable call`,
  });

  // Projected first invoice calculation
  let projectedInvoiceCents: number;
  if (contract.billing_cadence === 'annual_prepaid') {
    const annualBase =
      contract.base_rate_cents *
      (contract.commitment_months > 1 ? contract.commitment_months : 12);
    projectedInvoiceCents =
      annualBase - discountCents + (contract.integration_fees_cents || 0);
  } else {
    projectedInvoiceCents =
      contract.net_rate_cents + (contract.integration_fees_cents || 0);
  }

  rows.push({
    item: 'Projected first invoice (excl. usage & taxes)',
    terms: formatUsd(projectedInvoiceCents),
    highlight: 'total',
  });

  // Render Table Rows
  let curY = tY + 6.2;
  const rowH = 5.2;

  for (const r of rows) {
    if (r.highlight === 'recur') {
      doc.setFillColor(250, 248, 242);
      doc.rect(MARGIN_L, curY, CONTENT_W, rowH, 'F');
    } else if (r.highlight === 'total') {
      doc.setFillColor(246, 238, 219);
      doc.rect(MARGIN_L, curY, CONTENT_W, rowH + 0.8, 'F');
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.2);
    const bottomY = curY + (r.highlight === 'total' ? rowH + 0.8 : rowH);
    doc.line(MARGIN_L, bottomY, MARGIN_R, bottomY);

    if (r.highlight === 'total') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_DARK);
      doc.text(r.item, 21, curY + 4);
      doc.setFontSize(8.5);
      doc.text(r.terms, 189, curY + 4, { align: 'right' });
      curY += rowH + 0.8;
    } else if (r.highlight === 'recur') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...SLATE_DARK);
      doc.text(r.item, 21, curY + 3.7);
      doc.text(r.terms, 189, curY + 3.7, { align: 'right' });
      curY += rowH;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(...SLATE_BODY);
      doc.text(r.item, 21, curY + 3.7);
      doc.setTextColor(...SLATE_DARK);
      doc.text(r.terms, 189, curY + 3.7, { align: 'right' });
      curY += rowH;
    }
  }

  // Note below table
  curY += 2.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(
    'Usage-based charges are variable and are not included in any fixed total. Example: 550 billable calls on a 500 allowance = 50 x $1.00 = $50.00 overage.',
    MARGIN_L,
    curY
  );

  // Section: Terms and Conditions
  curY += 6.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...NAVY);
  doc.text('Terms and Conditions', MARGIN_L, curY);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_L, curY + 1.8, 56, curY + 1.8);
  curY += 6;

  const p1Terms = [
    {
      title: '1. Parties and Definitions',
      body: `This Recurring Services Agreement is entered into between Theoremlabs Partners LLC ("Provider") and ${contract.legal_business_name} ("Customer"). Capitalized terms have the meanings given in this Agreement and its Schedules, which control in the order: Special Terms, Order Summary, these Terms.`,
    },
    {
      title: '2. Services and Usage',
      body: `Provider will make the PromptLine ${capitalize(contract.plan_tier)} plan available to Customer, including ${contract.included_calls.toLocaleString('en-US')} billable calls per billing month. Unused calls do not roll over. Billable calls are defined in the Call Usage Schedule as approved by Provider.`,
    },
    {
      title: '3. Term, Renewal and Cancellation',
      body: `The subscription begins on ${contract.service_start_date} on a ${contract.commitment_months > 1 ? `${contract.commitment_months}-month` : 'month-to-month'} committed basis and renews automatically for like periods unless either party gives written notice at least 30 days before renewal.`,
    },
  ];

  for (const t of p1Terms) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...DARK_NAVY);
    doc.text(t.title, MARGIN_L, curY);
    curY += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_BODY);
    const lines = doc.splitTextToSize(t.body, CONTENT_W);
    for (const l of lines) {
      doc.text(l, MARGIN_L, curY);
      curY += 3.5;
    }
    curY += 2;
  }

  // ==================================================================
  // PAGE 2
  // ==================================================================
  doc.addPage();
  drawHeader();

  let p2Y = 30;

  const p2Terms = [
    {
      title: '4. Fees and Overages',
      body: `Customer authorizes recurring charges per the Order Summary. Billable calls exceeding the monthly allowance are charged at ${formatUsd(contract.overage_rate_cents)} per call. Taxes are calculated by Provider's billing provider at invoicing. Disputes must be raised in writing within 30 days of invoice.`,
    },
    {
      title: '5. Implementation and Integrations',
      body:
        contract.integration_fees_cents > 0
          ? `Custom integration and setup is included as specified in the Order Summary (${formatUsd(contract.integration_fees_cents)}${contract.integration_notes ? `: ${contract.integration_notes}` : ''}).`
          : 'No custom integration is included in this Agreement.',
    },
    {
      title: '6. Support',
      body: `Support is provided via email at the ${capitalize(contract.support_tier)} tier, Mon–Fri 9am–5pm ET. Service levels are as defined in the attached SLA exhibit.`,
    },
    {
      title: '7. Customer Responsibilities',
      body: 'Customer will use the Services lawfully, honor opt-out requests, and is responsible for obtaining all consents required under TCPA, telemarketing and state recording and SMS laws.',
    },
    {
      title: '8. Recording, AI Disclosure and Limitations',
      body: 'Calls may be recorded and transcribed. AI agents may produce errors, inaccurate bookings or outages. The Services are not intended for emergency or high-risk use. Except as expressly stated, the Services are provided without warranties.',
    },
    {
      title: '9. Data Privacy',
      body: 'Each party will comply with applicable data protection law. Data processing, security, retention and subprocessors are governed by the Data Processing Addendum where attached.',
    },
    {
      title: '10. IP and Confidentiality',
      body: "Provider retains all rights in the Services. Customer retains rights in Customer data. Each party will protect the other's confidential information.",
    },
    {
      title: '11. Limitation of Liability',
      body: "Neither party is liable for indirect or consequential damages. Each party's aggregate liability is capped as set out in counsel-approved terms, except where non-waivable law provides otherwise.",
    },
    {
      title: '12. Termination',
      body: 'Either party may terminate for material breach not cured within 30 days of written notice. Provisions that by nature survive termination will survive.',
    },
    {
      title: '13. General',
      body: 'This Agreement is governed by the laws of the State of North Carolina. Electronic signatures are binding. Amendments must be in writing and signed by both parties.',
    },
  ];

  for (const t of p2Terms) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...DARK_NAVY);
    doc.text(t.title, MARGIN_L, p2Y);
    p2Y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_BODY);
    const lines = doc.splitTextToSize(t.body, CONTENT_W);
    for (const l of lines) {
      doc.text(l, MARGIN_L, p2Y);
      p2Y += 3.4;
    }
    p2Y += 1.8;
  }

  // Section: Signatures
  p2Y += 3;
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...NAVY);
  doc.text('Signatures', MARGIN_L, p2Y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_L, p2Y + 1.8, 37, p2Y + 1.8);
  p2Y += 6;

  // Subheadings
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text('CUSTOMER', MARGIN_L, p2Y);
  doc.text('PROVIDER', rBoxX, p2Y);

  const sigLineY = p2Y + 17;
  doc.setDrawColor(...SLATE_MUTED);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_L, sigLineY, 90, sigLineY);
  doc.line(rBoxX, sigLineY, 180, sigLineY);

  // Customer fields
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_DARK);
  doc.text(
    `Name: ${contract.authorized_signer_name || contract.primary_contact_name || ''}`,
    MARGIN_L,
    sigLineY + 5.5
  );
  doc.text(
    `Title: ${contract.authorized_signer_title || ''}`,
    MARGIN_L,
    sigLineY + 10.5
  );
  doc.text('Date: __________________', MARGIN_L, sigLineY + 15.5);

  // Provider fields
  doc.text('Name: ', rBoxX, sigLineY + 5.5);
  doc.text('Title: Authorized Signatory', rBoxX, sigLineY + 10.5);
  doc.text('Date: __________________', rBoxX, sigLineY + 15.5);

  // ── Render Footers on all pages ───────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  return doc;
}
