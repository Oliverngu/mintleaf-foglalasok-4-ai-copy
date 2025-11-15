export interface Env {
  RESEND_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

type EmailPayload = {
  typeId: string;
  unitId?: string | null;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  locale?: 'hu' | 'en';
  payload?: Record<string, any>;
  meta?: Record<string, any> | null;
};

type EmailProfile = {
  from: string;
  replyTo?: string;
  subject: (params: EmailPayload) => string;
  html: (params: EmailPayload) => string;
};

const EMAIL_PROFILES: Record<string, Record<string, EmailProfile>> = {
  booking_created_guest: {
    default: {
      from: 'booking@mintleaf.hu',
      replyTo: 'info@mintleaf.hu',
      subject: ({ payload }) => {
        const name = payload?.name ?? 'Vendég';
        return `Foglalásod beérkezett - Gin & Avocado, ${name}`;
      },
      html: ({ payload }) => {
        const name = payload?.name ?? 'Vendég';
        const date = payload?.date ?? '-';
        const headcount = payload?.headcount ?? '-';
        return `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
            <h1 style="font-size: 20px; margin-bottom: 8px;">Foglalási kérésed megérkezett</h1>
            <p style="margin: 0 0 12px 0;">Kedves ${name}!</p>
            <p style="margin: 0 0 12px 0;">
              Köszönjük a foglalási kérelmed! Hamarosan visszaigazoljuk a megadott elérhetőségedre.
            </p>
            <h2 style="font-size: 16px; margin: 16px 0 8px 0;">Foglalás részletei</h2>
            <ul style="list-style: none; padding: 0; margin: 0 0 12px 0;">
              <li><strong>Dátum:</strong> ${date}</li>
              <li><strong>Létszám:</strong> ${headcount} fő</li>
            </ul>
            <p style="font-size: 12px; color: #6B7280; margin-top: 16px;">
              Ha nem te kezdeményezted ezt a foglalást, kérjük jelezd nekünk.
            </p>
          </div>
        `;
      },
    },
  },

  leave_request_created: {
    default: {
      from: 'hr@mintleaf.hu',
      subject: ({ payload }) => {
        const userName = payload?.userName ?? 'Ismeretlen felhasználó';
        return `Új szabadságkérvény: ${userName}`;
      },
      html: ({ payload }) => {
        const userName = payload?.userName ?? 'Ismeretlen felhasználó';
        const dates = payload?.dates ?? '-';
        const note = payload?.note ?? '-';
        return `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
            <h1 style="font-size: 20px; margin-bottom: 8px;">Új szabadságkérés érkezett</h1>
            <p style="margin: 0 0 8px 0;"><strong>Munkavállaló:</strong> ${userName}</p>
            <p style="margin: 0 0 8px 0;"><strong>Időszak(ok):</strong> ${dates}</p>
            <p style="margin: 0 0 8px 0;"><strong/Megjegyzés:</strong> ${note}</p>
          </div>
        `;
      },
    },
  },

  leave_request_approved: {
    default: {
      from: 'hr@mintleaf.hu',
      subject: ({ payload }) => {
        const userName = payload?.userName ?? 'Kolléga';
        return `Szabadságkérelmed jóváhagyva - ${userName}`;
      },
      html: ({ payload }) => {
        const userName = payload?.userName ?? 'Kolléga';
        const dates = payload?.dates ?? '-';
        return `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
            <h1 style="font-size: 20px; margin-bottom: 8px;">Szabadságkérelmed jóváhagyva</h1>
            <p style="margin: 0 0 12px 0;">Kedves ${userName}!</p>
            <p style="margin: 0 0 8px 0;">A következő időszak(ok)ra beadott szabadságkérelmed jóváhagyásra került:</p>
            <p style="margin: 0 0 8px 0;"><strong>${dates}</strong></p>
          </div>
        `;
      },
    },
  },
};

function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

async function handleOptions(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowedList = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const headers = buildCorsHeaders(origin, allowedList);
  return new Response(null, { status: 204, headers });
}

async function handleSendEmail(request: Request, env: Env): Promise<Response> {
  let body: EmailPayload;
  try {
    body = (await request.json()) as EmailPayload;
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { typeId, unitId = 'default', to, cc, bcc, payload = {}, meta = null } = body;

  if (!typeId || !to) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing typeId or to field' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const profilesForType = EMAIL_PROFILES[typeId];
  if (!profilesForType) {
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown typeId: ${typeId}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const profile =
    profilesForType[unitId] ||
    profilesForType['default'];

  if (!profile) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `No email profile configured for typeId=${typeId}, unitId=${unitId}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.length < 10) {
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'debug',
        message: 'Worker elérhető, de RESEND_API_KEY nincs beállítva vagy túl rövid – csak szimuláció.',
        typeId,
        unitId,
        to,
        payload,
        meta,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const subject = profile.subject(body);
  const html = profile.html(body);
  const toArray = Array.isArray(to) ? to : [to];

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: profile.from,
        to: toArray,
        cc: cc && cc.length > 0 ? cc : undefined,
        bcc: bcc && bcc.length > 0 ? bcc : undefined,
        reply_to: profile.replyTo,
        subject,
        html,
      }),
    });

    const data = await resendResponse.json<any>().catch(() => null);

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Resend API error',
          status: resendResponse.status,
          data,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        typeId,
        unitId,
        to: toArray,
        data,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Failed to call Resend API',
        details: err?.message ?? String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/email/send') {
      const origin = request.headers.get('Origin');
      const allowedList = parseAllowedOrigins(env.ALLOWED_ORIGINS);
      const baseHeaders = buildCorsHeaders(origin, allowedList);
      const res = await handleSendEmail(request, env);
      const mergedHeaders = new Headers(res.headers);
      for (const [k, v] of Object.entries(baseHeaders)) {
        mergedHeaders.set(k, v as string);
      }
      return new Response(res.body, { status: res.status, headers: mergedHeaders });
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  },
};
