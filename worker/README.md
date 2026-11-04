# Form proxy (Cloudflare Worker)

Purpose: the Web3Forms access key stays secret (stored in Cloudflare), and the Worker adds checks the
browser cannot be trusted with: allowed website only, field whitelist/limits, rate limit, optional Turnstile.

## Deploy (dashboard, no command line)
1. Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker -> name it `summit-form` -> Deploy.
2. Edit code -> paste the content of `worker/index.js` -> Deploy.
3. Settings -> Variables and Secrets -> Add **Secret** `WEB3FORMS_KEY` = your Web3Forms access key.
4. (Recommended) Settings -> Bindings -> Add -> **Rate limiting** -> variable name `RL`, e.g. 5 requests / 60 s.
5. Copy the worker URL (e.g. `https://summit-form.<account>.workers.dev`).
6. In `index.html` set `const FORM_PROXY = "<that URL>";` and add it to `connect-src` in `_headers`.
7. After a test submission works, rotate the Web3Forms key (create a new key, put it in the Worker secret,
   delete the old one) - the old key was public in the repository history.

## Optional: Cloudflare Turnstile (invisible captcha)
Create a Turnstile widget for summitautoschool.com, add the secret as `TURNSTILE_SECRET`, and ask me to add
the widget to the form (it sends `cf-turnstile-response`).
