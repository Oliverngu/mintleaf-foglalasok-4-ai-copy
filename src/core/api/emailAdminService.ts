// src/core/api/emailAdminService.ts

export interface EmailTestPayload {
  serviceId: string;
  templateKey: string;
  to: string;
  samplePayload?: Record<string, any>;
}

// jelenlegi Cloud Run URL
const ADMIN_BASE_URL =
  "https://admin-1053273095803.europe-central2.run.app";

export async function sendTestEmail(
  payload: EmailTestPayload
): Promise<{ ok: boolean; message: string; raw?: any }> {
  try {
    const res = await fetch(`${ADMIN_BASE_URL}/email-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // most még publikus a service, ezért nem kell Authorization
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Email test HTTP error:", res.status, text);
      return {
        ok: false,
        message: `HTTP ${res.status} - ${text || "Unknown error"}`,
      };
    }

    const data = await res.json().catch(() => null);
    return {
      ok: true,
      message: data?.message ?? "Email test OK",
      raw: data,
    };
  } catch (err) {
    console.error("Network error during email test:", err);
    return { ok: false, message: "Network error" };
  }
}