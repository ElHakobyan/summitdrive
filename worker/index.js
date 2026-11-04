// Cloudflare Worker: receives the sign-up form from summitautoschool.com and forwards it to Web3Forms.
// The Web3Forms access key lives ONLY here (as a secret), never in the website code.
//
// Secrets / bindings (Workers dashboard -> your worker -> Settings -> Variables and Secrets):
//   WEB3FORMS_KEY      (secret, required)  your Web3Forms access key
//   TURNSTILE_SECRET   (secret, optional)  Cloudflare Turnstile secret; if set, the form must send "cf-turnstile-response"
//   RL                 (optional)          Rate Limiting binding, see README
const ALLOWED_ORIGINS = ["https://summitautoschool.com", "https://www.summitautoschool.com"];
const FIELDS = {          // allowed fields and max lengths; everything else is dropped
  name: 80, phone: 30, course: 120, date: 12, time: 8, instructor: 80, duration_hours: 3,
  end_time: 8, price_amd: 10, status: 200,
};

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...(origin ? cors(origin) : {}) } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ success: false, message: "forbidden" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ success: false, message: "method" }, 405, origin);

    // rate limit per IP (if the RL binding is configured)
    if (env.RL) {
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RL.limit({ key: ip });
      if (!success) return json({ success: false, message: "too many requests" }, 429, origin);
    }

    const raw = await req.text();
    if (raw.length > 4000) return json({ success: false, message: "too large" }, 413, origin);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ success: false, message: "bad json" }, 400, origin); }
    if (!body || typeof body !== "object") return json({ success: false, message: "bad body" }, 400, origin);

    // optional Cloudflare Turnstile check
    if (env.TURNSTILE_SECRET) {
      const token = body["cf-turnstile-response"];
      if (!token) return json({ success: false, message: "captcha" }, 400, origin);
      const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: req.headers.get("CF-Connecting-IP") || "" }),
      }).then(r => r.json()).catch(() => ({}));
      if (!v.success) return json({ success: false, message: "captcha" }, 400, origin);
    }

    // whitelist + trim + length-limit the fields
    const clean = {};
    for (const [k, max] of Object.entries(FIELDS)) {
      if (body[k] !== undefined && body[k] !== null) clean[k] = String(body[k]).replace(/[\r\n]+/g, " ").trim().slice(0, max);
    }
    if (!clean.name || clean.name.length < 2) return json({ success: false, message: "name" }, 400, origin);
    if (!/^[+\d][\d\s()\-]{5,28}$/.test(clean.phone || "")) return json({ success: false, message: "phone" }, 400, origin);
    if (/https?:\/\/|<|>/i.test(JSON.stringify(clean))) return json({ success: false, message: "rejected" }, 400, origin); // no links/HTML in a sign-up

    const booking = !!clean.instructor;
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: env.WEB3FORMS_KEY,
        subject: booking ? "Summit Drive: NEW BOOKING (awaiting payment)" : "Summit Drive: new sign-up request",
        from_name: "Summit Drive website",
        ...clean,
      }),
    });
    const out = await res.json().catch(() => ({}));
    return json({ success: !!out.success }, out.success ? 200 : 502, origin);
  },
};
