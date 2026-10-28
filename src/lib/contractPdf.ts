import { jsPDF } from 'jspdf';
import type { TenantContract } from '@/types/domain';

// ── Colours ───────────────────────────────────────────────────────────
const NAVY: [number, number, number] = [15, 30, 80];
const GOLD: [number, number, number] = [180, 140, 50];
const CREAM: [number, number, number] = [245, 240, 230];
const BODY: [number, number, number] = [50, 50, 50];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [245, 245, 245];
const BORDER_GRAY: [number, number, number] = [200, 200, 200];

// ── Layout constants ─────────────────────────────────────────────────
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN_L = 20;
const MARGIN_R = 20;
const MARGIN_TOP = 35; // usable area starts here (below header)
const MARGIN_BOT = 25; // footer zone
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

const TEMPLATE_VERSION = 'v2026.1';

// ── Helpers ──────────────────────────────────────────────────────────
const formatUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const capitalize = (s: string): string =>
  s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// ── PDF Generator ────────────────────────────────────────────────────
export function generateContractPdf(contract: TenantContract): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN_TOP;

  // ── Y-position helpers ───────────────────────────────────────────
  const remaining = () => PAGE_H - MARGIN_BOT - y;

  const ensureSpace = (need: number) => {
    if (remaining() < need) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  };

  const setFont = (
    style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal',
    size = 10,
    color: [number, number, number] = BODY,
  ) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const drawLine = (yPos: number) => {
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_L, yPos, PAGE_W - MARGIN_R, yPos);
  };

  // Adds wrapped text, auto-paginating as needed. Returns final y.
  const addWrappedText = (
    text: string,
    x: number,
    startY: number,
    maxW: number,
    lineH: number,
  ): number => {
    const lines: string[] = doc.splitTextToSize(text, maxW);
    let cy = startY;
    for (const line of lines) {
      if (cy + lineH > PAGE_H - MARGIN_BOT) {
        doc.addPage();
        cy = MARGIN_TOP;
      }
      doc.text(line, x, cy);
      cy += lineH;
    }
    return cy;
  };

  // ================================================================
  // PAGE 1 — Cover + Parties + Order Summary
  // ================================================================

  // Title
  setFont('bold', 22, NAVY);
  doc.text('SaaS Recurring Services Agreement', PAGE_W / 2, y, {
    align: 'center',
  });
  y += 10;

  // Date line
  setFont('normal', 10, BODY);
  const dateLine = `Agreement Date: ${formatDate(contract.agreement_date)}  |  Service Start Date: ${formatDate(contract.service_start_date)}`;
  doc.text(dateLine, PAGE_W / 2, y, { align: 'center' });
  y += 10;

  drawLine(y);
  y += 6;

  // ── Parties ────────────────────────────────────────────────────
  setFont('bold', 13, NAVY);
  doc.text('Parties', MARGIN_L, y);
  y += 7;

  const colW = (CONTENT_W - 10) / 2; // 10mm gutter
  const leftX = MARGIN_L;
  const rightX = MARGIN_L + colW + 10;

  // Provider column
  const providerStartY = y;
  setFont('bold', 10, NAVY);
  doc.text('PROVIDER', leftX, y);
  y += 5;
  setFont('bold', 10, BODY);
  doc.text('Theoremlabs Partners LLC', leftX, y);
  y += 4.5;
  setFont('normal', 9, BODY);
  doc.text('d/b/a PromptLine', leftX, y);
  y += 5;
  doc.text('101 S. Tryon St, STE 2700', leftX, y);
  y += 4;
  doc.text('Charlotte, NC 28280', leftX, y);
  y += 5;
  doc.text('contracts@promptline.ai', leftX, y);
  y += 4;
  const providerEndY = y;

  // Customer column
  let cy = providerStartY;
  setFont('bold', 10, NAVY);
  doc.text('CUSTOMER', rightX, cy);
  cy += 5;
  setFont('bold', 10, BODY);
  doc.text(contract.legal_business_name, rightX, cy);
  cy += 4.5;
  if (contract.dba_name) {
    setFont('normal', 9, BODY);
    doc.text(`d/b/a ${contract.dba_name}`, rightX, cy);
    cy += 4.5;
  }
  setFont('normal', 9, BODY);
  if (contract.billing_address) {
    const addrLines = doc.splitTextToSize(contract.billing_address, colW);
    for (const l of addrLines) {
      doc.text(l, rightX, cy);
      cy += 4;
    }
  }
  if (contract.state) {
    doc.text(`${contract.state}, ${contract.country}`, rightX, cy);
    cy += 4;
  } else {
    doc.text(contract.country, rightX, cy);
    cy += 4;
  }
  cy += 1;
  if (contract.primary_contact_name) {
    doc.text(`Contact: ${contract.primary_contact_name}`, rightX, cy);
    cy += 4;
  }
  if (contract.primary_contact_email) {
    doc.text(contract.primary_contact_email, rightX, cy);
    cy += 4;
  }
  if (contract.primary_contact_phone) {
    doc.text(contract.primary_contact_phone, rightX, cy);
    cy += 4;
  }
  if (contract.accounts_payable_email) {
    doc.text(`AP: ${contract.accounts_payable_email}`, rightX, cy);
    cy += 4;
  }
  cy += 1;
  if (contract.authorized_signer_name) {
    setFont('bold', 9, BODY);
    doc.text('Authorized Signer', rightX, cy);
    cy += 4;
    setFont('normal', 9, BODY);
    doc.text(contract.authorized_signer_name, rightX, cy);
    cy += 4;
    if (contract.authorized_signer_title) {
      doc.text(contract.authorized_signer_title, rightX, cy);
      cy += 4;
    }
    if (contract.authorized_signer_email) {
      doc.text(contract.authorized_signer_email, rightX, cy);
      cy += 4;
    }
  }

  y = Math.max(providerEndY, cy) + 6;
  drawLine(y);
  y += 8;

  // ── Order Summary Table ────────────────────────────────────────
  setFont('bold', 13, NAVY);
  doc.text('Order Summary', MARGIN_L, y);
  y += 7;

  const billingLabel =
    contract.billing_cadence === 'annual_prepaid'
      ? 'Annual (Prepaid)'
      : 'Monthly';

  const commitmentLabel =
    contract.commitment_months <= 1
      ? 'Month-to-Month'
      : `${contract.commitment_months} months`;

  const discountLabel = contract.discount_percent
    ? `${contract.discount_percent}%${contract.discount_label ? ` (${contract.discount_label})` : ''}`
    : 'None';

  const integrationLabel = contract.integration_fees_cents
    ? `${formatUsd(contract.integration_fees_cents)} (one-time)${contract.integration_notes ? ` — ${contract.integration_notes}` : ''}`
    : '$0';

  // Projected first invoice: net_rate + integration fees
  const projectedFirstInvoice =
    contract.net_rate_cents + contract.integration_fees_cents;

  const rows: [string, string][] = [
    ['Plan Tier', capitalize(contract.plan_tier)],
    ['Billing Cadence', billingLabel],
    ['Commitment Term', commitmentLabel],
    ['Base Monthly Rate', formatUsd(contract.base_rate_cents)],
    ['Discount', discountLabel],
    ['Net Monthly Subscription', formatUsd(contract.net_rate_cents)],
    [
      'Included Calls / Month',
      contract.included_calls.toLocaleString('en-US'),
    ],
    ['Overage Rate', `${formatUsd(contract.overage_rate_cents)} / call`],
    ['Integration / Setup Fees', integrationLabel],
    ['Support Level', capitalize(contract.support_tier)],
    ['Projected First Invoice', formatUsd(projectedFirstInvoice)],
  ];

  const colItemW = CONTENT_W * 0.4;
  const colDetailW = CONTENT_W * 0.6;
  const rowH = 7;

  // Header row
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'F');
  setFont('bold', 9, WHITE);
  doc.text('Item', MARGIN_L + 3, y + 5);
  doc.text('Details', MARGIN_L + colItemW + 3, y + 5);
  y += rowH;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    ensureSpace(rowH);
    if (i % 2 === 0) {
      doc.setFillColor(...LIGHT_GRAY);
      doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'F');
    }
    setFont('bold', 9, BODY);
    doc.text(rows[i][0], MARGIN_L + 3, y + 5);
    setFont('normal', 9, BODY);
    doc.text(rows[i][1], MARGIN_L + colItemW + 3, y + 5);
    y += rowH;
  }

  // Border around table
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.3);
  doc.rect(
    MARGIN_L,
    y - rowH * (rows.length + 1),
    CONTENT_W,
    rowH * (rows.length + 1),
  );

  if (contract.integration_notes && !contract.integration_fees_cents) {
    y += 3;
    setFont('italic', 8, BODY);
    doc.text(`Note: ${contract.integration_notes}`, MARGIN_L, y);
    y += 5;
  }

  // ================================================================
  // PAGES 2+ — Terms & Conditions
  // ================================================================
  doc.addPage();
  y = MARGIN_TOP;

  setFont('bold', 16, NAVY);
  doc.text('Terms & Conditions', MARGIN_L, y);
  y += 10;

  const sections: { title: string; body: string }[] = [
    {
      title: 'Section 1 — Parties & Definitions',
      body: '"Provider" means Theoremlabs Partners LLC d/b/a PromptLine. "Customer" means the entity identified above. "Services" means the PromptLine AI-powered call-answering and lead-management platform, including the phone number, voice agent, dashboard, and related integrations provided under the selected Plan.',
    },
    {
      title: 'Section 2 — Services & Usage',
      body: 'Provider grants Customer a non-exclusive, non-transferable right to use the Services during the Term. Usage is limited to the number of Included Calls per billing period as specified in the Order Summary. "Call" means any inbound or outbound telephone interaction handled by the PromptLine AI agent, regardless of duration.',
    },
    {
      title: 'Section 3 — Term, Renewal & Cancellation',
      body: 'The initial term begins on the Service Start Date and continues for the Commitment Term specified above. Thereafter, the agreement auto-renews on a month-to-month basis unless either party gives at least thirty (30) days\u2019 written notice before the end of the then-current term. Customer may cancel at any time; cancellation takes effect at the end of the current paid period. No pro-rated refunds are issued for partial periods.',
    },
    {
      title: 'Section 4 — Fees, Billing & Overages',
      body: 'Customer shall pay the Net Monthly Subscription fee in advance on each billing date. Overage calls beyond the Included Calls allowance are billed at the Overage Rate shown above, invoiced in arrears at the next billing cycle. All fees are in U.S. Dollars. Late payments accrue interest at 1.5% per month or the maximum rate permitted by law, whichever is less.',
    },
    {
      title: 'Section 5 — Implementation & Integrations',
      body: 'Provider will configure the Services within five (5) business days of the Service Start Date, including phone number provisioning, AI agent setup, and any custom integrations specified in the Order Summary. One-time Integration / Setup Fees, if any, are due upon execution of this Agreement.',
    },
    {
      title: 'Section 6 — Support',
      body: 'Provider offers support at the tier indicated in the Order Summary. Standard support includes email support during business hours (Mon\u2013Fri 9 AM \u2013 6 PM ET). Priority support adds phone support and a 4-hour response SLA. Dedicated support includes a named account manager and 1-hour response SLA.',
    },
    {
      title: 'Section 7 — Customer Responsibilities',
      body: 'Customer shall: (a) provide accurate business information for AI agent configuration; (b) maintain a valid payment method on file; (c) comply with all applicable laws, including telemarketing and do-not-call regulations; (d) not use the Services for any unlawful, fraudulent, or abusive purpose.',
    },
    {
      title: 'Section 8 — Call Recording & AI Disclosure',
      body: 'The Services may record calls and use artificial intelligence to transcribe, summarize, and respond to callers. Customer is solely responsible for compliance with all applicable recording consent laws (including two-party consent states) and for providing appropriate disclosures to callers that they may be interacting with an AI system.',
    },
    {
      title: 'Section 9 — Data Privacy & Security',
      body: 'Provider processes Customer Data solely to deliver the Services and in accordance with its Privacy Policy. Provider maintains commercially reasonable administrative, technical, and physical safeguards. Customer retains all ownership rights in Customer Data. Upon termination, Provider will delete Customer Data within ninety (90) days, except as required by law.',
    },
    {
      title: 'Section 10 — Intellectual Property & Confidentiality',
      body: 'Each party retains its pre-existing IP. Provider owns all rights in the Services, platform, AI models, and aggregated/anonymized data. Neither party shall disclose the other\u2019s Confidential Information without prior written consent, except as required by law.',
    },
    {
      title: 'Section 11 — Limitation of Liability',
      body: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. PROVIDER\u2019S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.',
    },
    {
      title: 'Section 12 — Termination for Cause',
      body: 'Either party may terminate this Agreement immediately upon written notice if the other party: (a) materially breaches and fails to cure within fifteen (15) days of notice; or (b) becomes insolvent, files for bankruptcy, or ceases operations.',
    },
    {
      title: 'Section 13 — General Provisions',
      body: 'This Agreement constitutes the entire agreement between the parties. It is governed by the laws of the State of North Carolina. Any disputes shall be resolved by binding arbitration in Charlotte, NC under AAA Commercial Rules. Neither party may assign this Agreement without the other\u2019s written consent. Notices shall be sent to the addresses or emails specified above. If any provision is held unenforceable, the remaining provisions continue in full force.',
    },
  ];

  const LINE_H = 4.5;

  for (const section of sections) {
    // Section heading
    ensureSpace(20);
    setFont('bold', 11, NAVY);
    doc.text(section.title, MARGIN_L, y);
    y += 6;

    // Section body
    setFont('normal', 10, BODY);
    y = addWrappedText(section.body, MARGIN_L, y, CONTENT_W, LINE_H);
    y += 6;
  }

  // ================================================================
  // SIGNATURE PAGE
  // ================================================================
  ensureSpace(90); // need room for signature blocks
  // If we don't have enough room, a new page was added by ensureSpace

  y += 4;
  drawLine(y);
  y += 8;

  setFont('bold', 14, NAVY);
  doc.text('Signatures', MARGIN_L, y);
  y += 4;
  setFont('normal', 9, BODY);
  doc.text(
    'IN WITNESS WHEREOF, the parties have executed this Agreement as of the Agreement Date.',
    MARGIN_L,
    y,
  );
  y += 10;

  const sigColW = (CONTENT_W - 14) / 2;
  const sigRightX = MARGIN_L + sigColW + 14;
  const sigLineLen = sigColW - 4;

  // ── Customer signature block ───────────────────────────────────
  let sy = y;
  setFont('bold', 10, NAVY);
  doc.text('CUSTOMER', MARGIN_L, sy);
  sy += 7;

  setFont('normal', 9, BODY);
  doc.text('Authorized Signer:', MARGIN_L, sy);
  setFont('bold', 9, BODY);
  doc.text(
    contract.authorized_signer_name || '________________________',
    MARGIN_L + 35,
    sy,
  );
  sy += 6;

  setFont('normal', 9, BODY);
  doc.text('Title:', MARGIN_L, sy);
  setFont('bold', 9, BODY);
  doc.text(
    contract.authorized_signer_title || '________________________',
    MARGIN_L + 35,
    sy,
  );
  sy += 6;

  setFont('normal', 9, BODY);
  doc.text('Email:', MARGIN_L, sy);
  setFont('bold', 9, BODY);
  doc.text(
    contract.authorized_signer_email || '________________________',
    MARGIN_L + 35,
    sy,
  );
  sy += 6;

  setFont('normal', 9, BODY);
  doc.text('Date:', MARGIN_L, sy);
  doc.text('_________________________', MARGIN_L + 35, sy);
  sy += 10;

  doc.text('Signature:', MARGIN_L, sy);
  drawLine(sy + 1);
  doc.line(MARGIN_L + 20, sy + 1, MARGIN_L + sigLineLen, sy + 1);

  // ── Provider signature block ───────────────────────────────────
  let py = y;
  setFont('bold', 10, NAVY);
  doc.text('PROVIDER', sigRightX, py);
  py += 7;

  setFont('normal', 9, BODY);
  doc.text('Name:', sigRightX, py);
  setFont('bold', 9, BODY);
  doc.text('Mayur Patel', sigRightX + 35, py);
  py += 6;

  setFont('normal', 9, BODY);
  doc.text('Title:', sigRightX, py);
  setFont('bold', 9, BODY);
  doc.text('Managing Partner', sigRightX + 35, py);
  py += 6;

  setFont('normal', 9, BODY);
  doc.text('Email:', sigRightX, py);
  setFont('bold', 9, BODY);
  doc.text('mayur@promptline.ai', sigRightX + 35, py);
  py += 6;

  setFont('normal', 9, BODY);
  doc.text('Date:', sigRightX, py);
  doc.text('_________________________', sigRightX + 35, py);
  py += 10;

  doc.text('Signature:', sigRightX, py);
  doc.line(sigRightX + 20, py + 1, sigRightX + sigLineLen, py + 1);

  // ================================================================
  // HEADERS & FOOTERS — final pass over all pages
  // ================================================================
  const totalPages = doc.getNumberOfPages();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // ── Header bar ───────────────────────────────────────────────
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, PAGE_W, 25, 'F');

    // Left side
    setFont('bold', 14, NAVY);
    doc.text('PROMPTLINE', MARGIN_L, 11);
    setFont('normal', 7, BODY);
    doc.text('by Theoremlabs Partners LLC', MARGIN_L, 16);

    // Right side
    setFont('bold', 9, NAVY);
    doc.text('SaaS Recurring Services Agreement', PAGE_W - MARGIN_R, 11, {
      align: 'right',
    });
    setFont('normal', 8, BODY);
    doc.text(
      `Agreement #${contract.agreement_number}`,
      PAGE_W - MARGIN_R,
      16,
      { align: 'right' },
    );

    // Thin line below header
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(0, 25, PAGE_W, 25);

    // ── Footer ───────────────────────────────────────────────────
    const footerY = PAGE_H - 10;

    // Thin line above footer
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_L, footerY - 4, PAGE_W - MARGIN_R, footerY - 4);

    setFont('normal', 7, BODY);
    doc.text(`Agreement #${contract.agreement_number}`, MARGIN_L, footerY);
    doc.text(TEMPLATE_VERSION, PAGE_W / 2, footerY, { align: 'center' });
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN_R, footerY, {
      align: 'right',
    });

    // Unsigned watermark
    if (contract.status !== 'signed') {
      setFont('bold', 7, [180, 50, 50]);
      doc.text(
        'UNSIGNED \u2013 FOR REVIEW ONLY',
        PAGE_W / 2,
        footerY + 4,
        { align: 'center' },
      );
    }
  }

  return doc;
}
