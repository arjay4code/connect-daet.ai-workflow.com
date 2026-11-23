import type {
  RoutingPipeline,
  RoutingPipelineState,
} from '../../../lib/workflow/routing-pipeline.ts';

export interface WorkflowNotificationEmail {
  actionUrl: string;
  appUrl: string;
  body: string;
  documentReference: string | null;
  eventType?: string | null;
  recipientName: string | null;
  routePipeline?: RoutingPipeline;
  subject: string;
  title: string;
}

const ROUTE_STATE_PRESENTATION: Record<
  RoutingPipelineState,
  { background: string; color: string; label: string }
> = {
  complete: { background: '#eaf7ef', color: '#237547', label: 'Done' },
  active: { background: '#eaf1ff', color: '#2258b5', label: 'In progress' },
  attention: { background: '#fff4dc', color: '#946200', label: 'Needs attention' },
  pending: { background: '#eef0f3', color: '#5d6674', label: 'Pending' },
  rejected: { background: '#fdecec', color: '#a53232', label: 'Rejected' },
  skipped: { background: '#eef0f3', color: '#5d6674', label: 'Stopped' },
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRoutePipeline(routePipeline: RoutingPipeline) {
  const rows = routePipeline.steps.map((step, index) => {
    const presentation = ROUTE_STATE_PRESENTATION[step.state];
    const marker = step.state === 'complete'
      ? '✓'
      : step.state === 'rejected'
        ? '!'
        : String(index + 1);
    const detail = [step.subtitle, step.detail]
      .filter((value): value is string => Boolean(value))
      .map(escapeHtml)
      .join(' · ');
    const connector = index < routePipeline.steps.length - 1
      ? `<tr><td width="34" align="center" style="padding:0 10px 0 0;"><span style="display:block;width:2px;height:12px;background:#dbe2ec;"></span></td><td height="12"></td></tr>`
      : '';

    return `<tr>
      <td width="34" align="center" valign="top" style="padding:0 10px 0 0;">
        <span style="display:inline-block;width:25px;height:25px;border-radius:50%;background:${presentation.background};color:${presentation.color};text-align:center;font-size:13px;font-weight:700;line-height:25px;">${marker}</span>
      </td>
      <td valign="top" style="padding:2px 0 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="color:#172033;font-size:14px;font-weight:700;line-height:1.35;">${escapeHtml(step.title)}</td>
            <td align="right" style="padding-left:8px;"><span style="display:inline-block;border-radius:12px;background:${presentation.background};color:${presentation.color};padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap;">${presentation.label}</span></td>
          </tr>
        </table>
        <p style="margin:3px 0 0;color:#606a79;font-size:12px;line-height:1.45;">${detail}</p>
      </td>
    </tr>${connector}`;
  }).join('');
  const currentState = ROUTE_STATE_PRESENTATION[routePipeline.whereaboutsState];

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;border:1px solid #e3e8f0;border-radius:14px;background:#f8fafd;">
    <tr><td style="padding:18px 18px 8px;">
      <p style="margin:0 0 8px;color:#0c1a34;font-size:16px;font-weight:700;">Request route</p>
      <p style="margin:0 0 16px;color:${currentState.color};font-size:13px;line-height:1.45;"><strong>Current status:</strong> ${escapeHtml(routePipeline.whereabouts)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
    </td></tr>
  </table>`;
}

export function renderWorkflowNotificationEmail(email: WorkflowNotificationEmail) {
  const recipientName = email.recipientName?.trim() || 'there';
  const documentReference = email.documentReference?.trim() || null;
  const appUrl = new URL(email.appUrl);
  const actionUrl = new URL(email.actionUrl, appUrl);
  if (actionUrl.origin !== appUrl.origin) {
    throw new Error('Workflow notification links must stay on the application origin.');
  }
  const actionHref = actionUrl.toString();
  const subject = email.subject.trim();
  const title = email.title.trim();
  const body = email.body.trim();
  const isCompletion = ['SUBMISSION_CLOSED', 'WORKFLOW_COMPLETED'].includes(email.eventType ?? '');
  const logoUrl = escapeHtml(new URL('/daet-logo.png', appUrl).toString());
  const summary = isCompletion
    ? 'Your submission has been completed and processed successfully.'
    : 'There is an update to your document request.';
  const safeUrl = escapeHtml(actionHref);
  const safeSummary = escapeHtml(summary);
  const safeBody = escapeHtml(body).replaceAll('\n', '<br />');
  const routePipelineHtml = email.routePipeline
    ? renderRoutePipeline(email.routePipeline)
    : '';
  const routePipelineText = email.routePipeline
    ? [
      'Request route:',
      `Current status: ${email.routePipeline.whereabouts}`,
      ...email.routePipeline.steps.map((step, index) => {
        const detail = [step.subtitle, step.detail].filter(Boolean).join(' · ');
        return `${index + 1}. ${step.title}${detail ? ` — ${detail}` : ''} (${ROUTE_STATE_PRESENTATION[step.state].label})`;
      }),
    ]
    : [];

  const text = [
    `Hello ${recipientName},`,
    '',
    title,
    summary,
    body,
    documentReference ? `Document reference: ${documentReference}` : '',
    ...routePipelineText,
    '',
    `Open document: ${actionHref}`,
    '',
    'You received this email because of activity on your Connect-Daet.ai account.',
  ].filter(Boolean).join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f2eee5;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2eee5;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:740px;background:#ffffff;border:1px solid #e3e1dc;border-radius:22px;overflow:hidden;box-shadow:0 12px 32px rgba(13,31,66,0.12);">
          <tr>
            <td style="background:#091a3a;padding:24px;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="58" valign="middle" style="padding-right:14px;">
                    <img src="${logoUrl}" alt="Municipality of Daet seal" width="54" height="54" style="display:block;width:54px;height:54px;border-radius:50%;background:#ffffff;" />
                  </td>
                  <td valign="middle" style="white-space:nowrap;font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-0.6px;">Connect-Daet<span style="color:#79a5f4;">.ai</span><br /><span style="color:#b4c3dd;font-size:11px;font-weight:400;letter-spacing:0;">Municipality of Daet</span></td>
                  <td align="right" width="110">
                    <svg role="presentation" aria-hidden="true" width="100" height="66" viewBox="0 0 104 66" xmlns="http://www.w3.org/2000/svg">
                      <g fill="none" stroke="#2a4779" stroke-width="2">
                        <path d="M52 17V8M39 31H18l-7-7M65 31h21l7-7M39 37H18l-7 7M65 37h21l7 7M52 49v9" />
                      </g>
                      <rect x="39" y="19" width="26" height="28" rx="5" fill="#102650" stroke="#395789" stroke-width="2" />
                      <path d="M45 28h14M45 34h10M45 40h14" stroke="#829ed0" stroke-width="2" />
                      <g fill="#395789">
                        <circle cx="52" cy="7" r="4" />
                        <circle cx="9" cy="22" r="4" />
                        <circle cx="94" cy="22" r="4" />
                        <circle cx="9" cy="46" r="4" />
                        <circle cx="94" cy="46" r="4" />
                        <circle cx="52" cy="60" r="4" />
                      </g>
                    </svg>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:0 32px 30px;">
            <p style="margin:-14px 0 28px;">
              <span style="display:inline-block;border:1px solid #dfe4ec;border-radius:20px;background:#ffffff;padding:7px 14px;color:#26344b;font-size:13px;font-weight:600;">
                <span style="color:#2463d1;font-size:16px;vertical-align:-1px;">●</span>&nbsp;&nbsp;Request update
              </span>
            </p>
            <p style="margin:0 0 18px;font-size:17px;">Hello ${escapeHtml(recipientName)},</p>
            <h1 style="margin:0 0 8px;color:#0c1a34;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.2;">${escapeHtml(title)}</h1>
            <p style="margin:0 0 22px;color:#303848;font-size:17px;line-height:1.5;">${safeSummary}</p>
            ${documentReference ? `<p style="margin:0 0 22px;color:#172033;font-size:15px;"><strong>Document reference:</strong>&nbsp; <span style="display:inline-block;border-radius:7px;background:#f1eee8;padding:5px 9px;font-weight:600;">${escapeHtml(documentReference)}</span></p>` : ''}
            ${body ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;"><tr><td width="52" valign="top"><span style="display:inline-block;width:38px;height:38px;border:1px solid #d7e3f7;border-radius:10px;background:#edf3ff;color:#2463d1;text-align:center;font-size:22px;line-height:38px;">▤</span></td><td valign="middle" style="color:#111827;font-size:18px;font-weight:700;line-height:1.4;">${safeBody}</td></tr></table>` : ''}
            ${routePipelineHtml}
            <p style="margin:0 0 24px;">
              <a href="${safeUrl}" style="display:inline-block;border-radius:26px;background:#1f5dcc;color:#ffffff;padding:13px 24px;text-decoration:none;font-size:16px;font-weight:700;">Open document&nbsp;&nbsp;↗</a>
            </p>
            <p style="margin:0;color:#515b6b;font-size:14px;line-height:1.5;">Sign in to Connect-Daet.ai to review the latest details and take any required action.</p>
          </td></tr>
          <tr><td style="border-top:1px solid #e5e7eb;padding:18px 32px;color:#78808d;font-size:13px;line-height:1.5;">Connect-Daet.ai · Daet document tracking<br />You received this email because of activity on your Connect-Daet.ai account.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { html, text };
}
