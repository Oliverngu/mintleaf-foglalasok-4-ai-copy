/**
 * =============================================================================
 * MintLeaf Email Gateway (Cloudflare Worker)
 * =============================================================================
 * This worker acts as a secure gateway to the Resend email service. It receives
 * requests from the frontend, determines the correct email template, populates
 * it with data, and sends the email.
 *
 * It includes robust CORS handling to allow requests from specified origins.
 *
 * How it works:
 * 1. The worker listens for POST requests on `/api/email/send`.
 * 2. It handles CORS preflight (OPTIONS) requests to allow cross-origin calls
 *    from web browsers.
 * 3. On a POST request, it validates the incoming JSON payload.
 * 4. It constructs the appropriate email (subject, HTML) based on the `typeId`.
 * 5. It sends the email using the Resend API.
 * 6. It returns a JSON response indicating success or failure.
 */

// --- Type Definitions ---

interface Env {
	/** API key for the Resend email service. */
	RESEND_API_KEY: string;
	/** Comma-separated list of allowed origins, or "*" to allow all. */
	ALLOWED_ORIGINS: string;
	/** The default "from" address for outgoing emails. */
	DEFAULT_SENDER: string;
}

interface EmailRequestPayload {
	typeId: string;
	to: string | string[];
	unitId?: string | null;
	locale?: 'hu' | 'en';
	payload?: Record<string, any>;
}

// --- CORS Helper ---

/**
 * Creates and returns CORS headers. As requested, this is now simplified to
 * always allow all origins ('*'). The previous dynamic logic has been removed
 * to ensure consistent behavior and fix the browser fetch error.
 * @param request The incoming Request object (not used in this simplified version).
 * @param env The worker's environment variables (not used in this simplified version).
 * @returns A Headers object with the appropriate CORS headers.
 */
function getCorsHeaders(request: Request, env: Env): Headers {
	const headers = new Headers();

	// Set the required CORS headers, hardcoding Allow-Origin to '*' as requested.
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	return headers;
}


// --- Main Worker Handler ---

export default {
	/**
	 * Main fetch handler, refactored for robust CORS handling.
	 * It acts as a wrapper that ensures CORS headers are applied to every response.
	 */
	async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
		// Immediately handle CORS preflight (OPTIONS) requests and exit.
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: getCorsHeaders(request, env),
			});
		}

		// For all other methods, first get the business logic response.
		let response: Response;
		try {
			if (request.method === 'POST') {
				// Delegate the core logic to a separate function.
				response = await handlePostRequest(request, env);
			} else {
				// Block other methods like GET, PUT, etc.
				response = new Response('Method Not Allowed', { status: 405 });
			}
		} catch (error: any) {
			// Catch any unexpected errors from the business logic.
			console.error('Unhandled error in request handler:', error);
			response = new Response(JSON.stringify({ ok: false, error: 'Internal Server Error' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Create a new mutable response based on the original one.
		// This is the safest way to add headers, as the original `response.headers` might be immutable.
		const finalResponse = new Response(response.body, response);

		// Get the appropriate CORS headers for the original request.
		const corsHeaders = getCorsHeaders(request, env);

		// Apply every CORS header to the final response, ensuring they are always present.
		corsHeaders.forEach((value, key) => {
			finalResponse.headers.set(key, value);
		});

		return finalResponse;
	},
};

/**
 * Handles the logic for POST requests, including validation and sending the email.
 * This function does not need to worry about CORS headers; they are handled by the main fetch handler.
 * @param request The incoming POST request.
 * @param env The worker's environment variables.
 * @returns A Response object.
 */
async function handlePostRequest(request: Request, env: Env): Promise<Response> {
	if (request.headers.get('Content-Type') !== 'application/json') {
		return new Response(JSON.stringify({ ok: false, error: 'Invalid Content-Type, must be application/json' }), {
			status: 415,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const body = (await request.json()) as EmailRequestPayload;

		if (!body.typeId || !body.to || (Array.isArray(body.to) && body.to.length === 0)) {
			return new Response(JSON.stringify({ ok: false, error: 'Missing required fields: typeId, to' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		// This is a simplified template selector. A real implementation would fetch from a DB.
        const getTemplate = (typeId: string, payload: any = {}) => {
            switch(typeId) {
                case 'booking_created_guest':
                    return {
                        subject: `Foglalásod részletei: ${payload.bookingName || 'Ismeretlen'}`,
                        html: `<strong>Szia ${payload.bookingName || 'Vendég'}!</strong><p>Köszönjük a foglalásod ${payload.headcount || '?'} főre.</p>`,
                    };
                case 'leave_request_created':
                     return {
                        subject: 'Új szabadságkérelem érkezett',
                        html: `<strong>Szabadságkérelem</strong><p>${payload.userName || 'Egyik munkatárs'} szabadságot kért.</p>`,
                    };
                default:
                    return {
                        subject: 'MintLeaf Értesítés',
                        html: `<p>Automatikus értesítés. Típus: ${typeId}</p>`
                    }
            }
        }
        
        const template = getTemplate(body.typeId, body.payload);

		const resendPayload = {
			from: env.DEFAULT_SENDER || 'Mintleaf <noreply@mintleaf.hu>',
			to: body.to,
			subject: template.subject,
			html: template.html,
		};

		const resendResponse = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(resendPayload),
		});

		if (!resendResponse.ok) {
			const errorBody = await resendResponse.json();
			console.error('Resend API error:', resendResponse.status, errorBody);
			return new Response(JSON.stringify({ ok: false, error: 'Email provider failed', details: errorBody }), {
				status: 502, // Bad Gateway
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const data = await resendResponse.json();
		return new Response(JSON.stringify({ ok: true, messageId: data.id }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});

	} catch (e) {
		console.error('Error processing POST request:', e);
		return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body or internal error' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

/**
 * =============================================================================
 * CORS LOGIKA MAGYARÁZATA
 * =============================================================================
 *
 * 1. OPTIONS kérések kezelése (Preflight):
 *    A böngészők biztonsági okokból egy "preflight" (ellenőrző) kérést küldenek
 *    a `POST` kérés előtt, `OPTIONS` metódussal. Erre a Workernek egy sikeres
 *    válasszal (204 No Content) kell felelnie, amely tartalmazza a megfelelő
 *    CORS fejléceket (`Access-Control-Allow-*`). Ez jelzi a böngészőnek,
 *    hogy az eredeti `POST` kérés biztonságosan elküldhető.
 *
 * 2. POST kérések és hibák kezelése:
 *    Miután a preflight sikeres volt, a böngésző elküldi a `POST` kérést.
 *    A Worker feldolgozza azt a `handlePostRequest` függvénnyel. Bármi is a
 *    logika eredménye (siker, hiba), a fő `fetch` handler a kapott `Response`
 *    objektumot egy újba csomagolja, és ahhoz adja hozzá a CORS fejléceket.
 *    Ez garantálja, hogy minden válasz megkapja a szükséges fejléceket.
 *
 * 3. `ALLOWED_ORIGINS` használata:
 *    - Ha az `ALLOWED_ORIGINS` értéke `*`, a Worker minden domainről
 *      elfogadja a kéréseket (`Access-Control-Allow-Origin: *`).
 *    - Ha az `ALLOWED_ORIGINS` egy vesszővel elválasztott lista (pl.
 *      "https://mintleaf.hu,http://localhost:5173"), a Worker ellenőrzi
 *      a kérés `Origin` fejlécét. Ha az `Origin` szerepel a listában,
 *      a Worker visszaadja azt az `Access-Control-Allow-Origin` fejlécben,
 *      jelezve, hogy az adott domain megbízható.
 */
