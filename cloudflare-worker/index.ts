/**
 * MintLeaf Email Gateway – Cloudflare Worker (ESM, TypeScript)
 * - Endpoint: POST /api/email/send
 * - Külső szolgáltató: Resend
 */

export interface Env {
  RESEND_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

type EmailPayloadContext = {
  payload?: any;
  typeId: string;
  unitId: string;
};

type EmailProfile = {
  from: string;
  replyTo?: string;
  subject: (ctx: EmailPayloadContext) => string;
  html: (ctx: EmailPayloadContext) => string;
};

const EMAIL_PROFILES: Record<string, Record<string, EmailProfile>> = {
  booking_created_guest: {
    default: {
      from: "booking@mintleaf.hu",
      replyTo: "info@mintleaf.hu",
      subject: ({ payload }) => {
        const name = payload?.name ?? "Vendég";
        return `Foglalásod beérkezett - Gin & Avocado, ${name}`;
      },
      html: ({ payload }) => {
        const name = payload?.name ?? "Vendég";
        const date = payload?.date ?? "-";
        const headcount = payload?.headcount ?? "-";
        return `
          <h1>Foglalási kérésed megérkezett</h1>
          <p>Kedves ${name}!</p>
          <p>Köszönjük a foglalási kérelmed!</p>
          <p><strong>Dátum:</strong> ${date}</p>
          <p><strong>Létszám:</strong> ${headcount} fő</p>
        `;
      },
    },
  },

  booking_created_admin: {
    default: {
      from: "booking@mintleaf.hu",
      replyTo: "info@mintleaf.hu",
      subject: ({ payload }) => {
        const name = payload?.name ?? "Vendég";
        const date = payload?.date ?? "-";
        return `Új foglalás érkezett: ${name} – ${date}`;
      },
      html: ({ payload }) => {
        const name = payload?.name ?? "Vendég";
        const date = payload?.date ?? "-";
        const headcount = payload?.headcount ?? "-";
        return `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
            <h1 style="font-size: 20px; margin-bottom: 8px;">Új foglalás érkezett</h1>
            <p style="margin: 0 0 12px 0;">
              Új foglalás érkezett a vendégtől: <strong>${name}</strong>.
            </p>
            <h2 style="font-size: 16px; margin: 16px 0 8px 0;">Foglalás részletei</h2>
            <ul style="list-style: none; padding: 0; margin: 0 0 12px 0;">
              <li><strong>Dátum, idő:</strong> ${date}</li>
              <li><strong>Létszám:</strong> ${headcount} fő</li>
            </ul>
            <p style="font-size: 12px; color: #6B7280; margin-top: 16px;">
              Ez egy automatikus értesítő a MintLeaf foglalási rendszerből.
            </p>
          </div>
        `;
      },
    },
  },

  leave_request_created: {
    default: {
      from: "hr@mintleaf.hu",
      subject: ({ payload }) =>
        `Új szabadságkérelem: ${payload?.userName ?? "Ismeretlen"}`,
      html: ({ payload }) =>
        `<p>${payload?.userName ?? "Munkatárs"} szabadságot kért: ${
          payload?.dates ?? "-"
        }</p>`,
      replyTo: "hr@mintleaf.hu",
    },
  },

  leave_request_approved: {
    default: {
      from: "hr@mintleaf.hu",
      subject: ({ payload }) =>
        `Szabadságkérelmed jóváhagyva - ${
          payload?.userName ?? "Kolléga"
        }`,
      html: ({ payload }) =>
        `<p>A következő időszak(ok)ra beadott kérelmed jóvá lett hagyva: ${
          payload?.dates ?? "-"
        }</p>`,
      replyTo: "hr@mintleaf.hu",
    },
  },

  leave_request_rejected: {
    default: {
      from: "hr@mintleaf.hu",
      subject: ({ payload }) =>
        `Szabadságkérelmed elutasításra került - ${
          payload?.userName ?? "Kolléga"
        }`,
      html: ({ payload }) =>
        `<p>Kedves ${payload?.userName ?? "Kolléga"}!</p>
         <p>A szabadságkérelmed elutasításra került.</p>
         <p><strong>Időszak:</strong> ${payload?.dates ?? "-"}</p>
         <p><strong>Megjegyzés:</strong> ${payload?.note ?? "-"}</p>`,
      replyTo: "hr@mintleaf.hu",
    },
  },

  schedule_published: {
    default: {
      from: "no-reply@mintleaf.hu",
      replyTo: "info@mintleaf.hu",
      subject: ({ payload }) => {
        const unitName = payload?.unitName ?? "Egység";
        const weekLabel = payload?.weekLabel ?? "";
        return weekLabel
          ? `Új beosztás publikálva - ${unitName} (${weekLabel})`
          : `Új beosztás publikálva - ${unitName}`;
      },
      html: ({ payload }) => {
        const unitName = payload?.unitName ?? "Egység";
        const weekLabel = payload?.weekLabel ?? "";
        const editorName = payload?.editorName ?? "Admin";
        const url = payload?.url ?? "#";
        return `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
            <h1 style="font-size: 20px; margin-bottom: 8px;">Új beosztás elérhető</h1>
            <p style="margin: 0 0 12px 0;">
              A(z) <strong>${unitName}</strong> egység friss beosztása publikálva lett
              ${
                weekLabel
                  ? `a(z) <strong>${weekLabel}</strong> hétre`
                  : ""
              }.
            </p>
            <p style="margin: 0 0 12px 0;">
              Szerkesztette: <strong>${editorName}</strong>
            </p>
            <p style="margin: 0 0 16px 0;">
              A beosztás megtekintéséhez kattints ide:<br/>
              <a href="${url}" style="color:#2563EB; text-decoration:underline;">Beosztás megnyitása</a>
            </p>
            <p style="font-size: 12px; color: #6B7280; margin-top: 16px;">
              Ez egy automatikus értesítő a MintLeaf rendszerből.
            </p>
          </div>
        `;
      },
    },
  },
};

// ===== CORS segédfüggvények =====

function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

async function handleOptions(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get("Origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const headers = buildCorsHeaders(origin, allowed);
  return new Response(null, { status: 204, headers });
}

// ===== Fő email handler =====

async function handleSendEmail(req: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const {
    typeId,
    unitId = "default",
    to,
    cc,
    bcc,
    payload = {},
    subject,
    html,
  } = body;

  if (!typeId || !to) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing fields" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const profiles = EMAIL_PROFILES[typeId];
  if (!profiles) {
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown typeId_v2: ${typeId}` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const profile = profiles[unitId] || profiles.default;

  // Ha a kliens küld subject / html-t, azt használjuk, különben fallback a profilra
  const ctx: EmailPayloadContext = { payload, typeId, unitId };

  const finalSubject =
    typeof subject === "string" && subject.trim().length > 0
      ? subject
      : profile.subject(ctx);

  const finalHtml =
    typeof html === "string" && html.trim().length > 0
      ? html
      : profile.html(ctx);

  const toArray = Array.isArray(to) ? to : [to];

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: profile.from,
      to: toArray,
      cc,
      bcc,
      reply_to: profile.replyTo,
      subject: finalSubject,
      html: finalHtml,
    }),
  });

  const data = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: "Resend API error", data }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, typeId, to: toArray, data }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// ===== Default export – Cloudflare Worker entrypoint =====

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/email/send") {
      const origin = request.headers.get("Origin");
      const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
      const cors = buildCorsHeaders(origin, allowed);

      const res = await handleSendEmail(request, env);
      const merged = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) {
        merged.set(k, v as string);
      }
      return new Response(res.body, { status: res.status, headers: merged });
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
