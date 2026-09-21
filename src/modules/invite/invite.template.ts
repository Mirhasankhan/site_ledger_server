import config from "@/config";

export interface InviteTemplateParams {
    email: string;
    role: string;
    workerCategory?: string | null;
    inviteLink: string;
}

export const generateInviteEmailHtml = ({
    email,
    role,
    workerCategory,
    inviteLink,
}: InviteTemplateParams): string => {
    const companyName = config.company_name || "Siteledger";
    const categoryText = workerCategory
        ? ` (${workerCategory.replace("_", " ")})`
        : "";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .logo-badge { display: inline-block; padding: 6px 12px; background: #fef3c7; color: #b45309; font-weight: 700; font-size: 13px; border-radius: 6px; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 16px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
    .info-label { color: #64748b; }
    .info-value { font-weight: 600; color: #0f172a; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #d97706; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
    .footer { font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; text-align: center; }
    .break-link { word-break: break-all; color: #d97706; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-badge">${companyName}</div>
    <h1>You're Invited to Join</h1>
    <p>You have been invited to join <strong>${companyName}</strong> as a <strong>${role}</strong>.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Email:</span> <span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Assigned Role:</span> <span class="info-value">${role}${categoryText}</span></div>
      <div class="info-row" style="margin-bottom:0;"><span class="info-label">Valid for:</span> <span class="info-value">7 days</span></div>
    </div>
    <p>Click the button below to accept your invitation, verify your credentials, and choose your account password:</p>
    <div class="btn-container">
      <a href="${inviteLink}" class="btn" target="_blank">Accept Invitation</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="break-link">${inviteLink}</p>
    <div class="footer">
      This invitation was issued by ${companyName}. If you were not expecting this invitation, you can ignore this email.
    </div>
  </div>
</body>
</html>
`;
};

export const generateInviteEmailText = ({
    role,
    inviteLink,
}: InviteTemplateParams): string => {
    const companyName = config.company_name || "Siteledger";
    return `You've been invited to join ${companyName} as a ${role}.\n\nTo accept your invitation and activate your account, visit:\n${inviteLink}\n\nThis invitation link will expire in 7 days.`;
};
