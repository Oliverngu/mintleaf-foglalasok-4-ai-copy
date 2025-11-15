// src/core/config/emailConfig.ts
interface EmailProviderConfig {
  provider: "mock" | "resend" | "sendgrid";
  apiKey?: string;
  fromDefault?: string;
}

export const emailProviderConfig: EmailProviderConfig = {
  provider: "mock",
  fromDefault: "noreply@mintleaf.app",
  // In the future, this could be:
  // apiKey: process.env.RESEND_API_KEY,
};
