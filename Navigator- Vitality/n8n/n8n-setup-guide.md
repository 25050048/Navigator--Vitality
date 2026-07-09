# Certificate Emailing — Game + n8n Setup Guide

This connects the **Navigator game** to your **n8n workflow** so that when a player
scores 100+, enters their name and email, and clicks **Get Certificate**, they receive
the PDF certificate by email.

There are two things to set up: the **game** (send the right data) and **n8n**
(receive it, build the PDF, email it).

---

## Part A — The game side (already done in the code)

When the player clicks **Get Certificate**, the game POSTs this JSON to your n8n webhook:

| Field              | Example                         | Used by your workflow for            |
|--------------------|---------------------------------|--------------------------------------|
| `secret`           | `mySecret123`                   | the **If** node (security gate)      |
| `name`             | `Jun Yuan`                      | congratulation + certificate name    |
| `email`            | `player@gmail.com`              | Gmail "send to"                      |
| `score`            | `142`                           | congratulation text                  |
| `participantName`  | `Jun Yuan`                      | `{{PARTICIPANT_NAME}}` on the cert   |
| `challengeName`    | `Road Safety`                   | `{{CHALLENGE_NAME}}`                 |
| `issuerName`       | `Navigator+ Vitality`           | `{{ISSUER_NAME}}`                    |
| `date`             | `09 July 2026`                  | `{{DATE}}`                           |
| `certId`           | `NV-2026-AB12CD-3947`           | `{{CERT_ID}}`                        |
| plus grade / stats | (from the report card)          | records, if you want them            |

You only have to do **two** things in `app.js` (top of the file):

1. Paste your webhook URL:
   `const N8N_CERT_WEBHOOK_URL = 'https://YOUR-N8N-HOST/webhook/game-complete';`
2. Make sure the secret matches your workflow:
   `const N8N_CERT_SECRET = 'mySecret123';`   (change both sides if you want a different secret)

> Where to find the webhook URL: open the **Webhook** node in n8n, copy the **Production URL**
> (looks like `https://xxxx.app.n8n.cloud/webhook/game-complete`). Use the **Test URL** while testing.

---

## Part B — The n8n side

You have two options. Option 1 is your current workflow (a text email, works immediately).
Option 2 is the upgraded workflow that attaches the real PDF certificate.

### Option 1 — Keep your current workflow (text email only)
Your existing "Game Completion Certificate" workflow already works with the game once you:
1. Set `N8N_CERT_WEBHOOK_URL` and `N8N_CERT_SECRET` in the game (Part A).
2. In the **Webhook** node → **Options** → set **Allowed Origins (CORS)** to `*`
   (this lets the browser call it — see "CORS" below).
3. Activate the workflow (toggle top-right) so the Production URL works.
Players will get an email with the AI congratulation sentence. No PDF.

### Option 2 — Upgraded workflow with the PDF certificate  (file: `Game-Completion-Certificate-PDF.json`)
This keeps your secret check and AI congratulation, and adds the certificate PDF as an attachment.

Flow:  **Webhook → If (secret) → Build Certificate HTML → Congrats (OpenRouter) → HTML to PDF (PDFShift) → Send a message (Gmail, PDF attached) → Respond**

Import and configure:

1. **Import it.** n8n → top-right menu → **Import from File** → choose `Game-Completion-Certificate-PDF.json`.

2. **Re-attach credentials** (import does not carry secrets):
   - **Congrats (OpenRouter)** node → Credentials → pick your existing OpenRouter *Header Auth*
     credential (the header is `Authorization` = `Bearer sk-or-...`).
   - **Send a message** (Gmail) node → Credentials → pick your Gmail OAuth2 credential.
   - **HTML to PDF (PDFShift)** node → Credentials → create a new **Basic Auth** credential:
     - **User** = `api`
     - **Password** = your PDFShift API key
     - Get a free key at pdfshift.io (free tier is enough for a school project).

3. **Webhook CORS:** open the **Webhook** node → **Options** → **Allowed Origins (CORS)** = `*`
   (the imported file already sets this, but double-check it saved).

4. **Activate** the workflow (toggle top-right). Copy the **Production URL** into the game's
   `N8N_CERT_WEBHOOK_URL`.

The certificate design lives inside the **Build Certificate HTML** node (it's the
`certificate-template.html` file embedded as text). To change the look, edit that template
and paste the new HTML into that node, keeping the `{{PLACEHOLDER}}` tags.

---

## Don't want to use PDFShift?
Any HTML-to-PDF service works — just swap the **HTML to PDF** node's URL/credential.
Alternatives: api2pdf, CraftMyPDF, APITemplate.io, or a self-hosted Gotenberg.
Or, for the simplest possible version, skip PDF entirely and email the HTML inline
(Option 1) — but A4 certificates look best as a PDF attachment.

---

## CORS — the most common reason "SEND" fails
The game runs in a browser, so the browser must be allowed to call your n8n webhook.
- Easiest: **Webhook node → Options → Allowed Origins (CORS) = `*`**.
- If your n8n version has no such option, the imported PDF workflow also adds an
  `Access-Control-Allow-Origin: *` header in the **Respond to Webhook** node.
- Also serve the game over `http://localhost` (or a real URL), not by double-clicking the file.

## Testing
1. In n8n, click **Execute workflow** (listens once) or **Activate** for the live URL.
2. In the game, reach 100 points → **Get Certificate** → enter name + email → **SEND**.
3. Watch the n8n execution light up node by node. Check the inbox (and spam) for the email.
4. If a node errors, click it to see the message — usually a missing credential or CORS.

## Security note
`mySecret123` only stops casual strangers hitting your webhook; it is visible in the game's
code. For a class project that's fine. Don't reuse it for anything sensitive, and give the
Gmail/PDFShift/OpenRouter credentials the smallest scope/limits you can.

---

## Troubleshooting log — 9 July 2026 (what was actually broken, and how it was fixed)

The live workflow (n8n workflow ID `JU0EFCtl6fTWVS3A`, name **"Game Completion Certificate"**)
had drifted from the version described above — someone was mid-way through switching the
OpenRouter call from a raw **HTTP Request** node to the native **Basic LLM Chain + OpenRouter
Chat Model** nodes, and the switch was left half-done. Here's exactly what was wrong and what
was changed, node by node:

1. **OpenRouter Chat Model node had no credential attached.**
   It was sitting with `parameters: {"options":{}}` and no `credentials` key at all, so every
   run failed before it could even reach OpenRouter.
   **Fix:** attached the existing native credential **"OpenRouter account 25050654"**
   (type `openRouterApi`) — this is a different credential type than the old `httpHeaderAuth`
   one used by the HTTP Request approach in `Game-Completion-Certificate-PDF.json`.

2. **Basic LLM Chain's prompt field contained a stray URL, not a prompt.**
   The "Prompt (User Message)" field literally read
   `https://n8ngc.codeblazar.org/webhook-test/game-complete` — leftover paste, not text for
   the AI.
   **Fix:** replaced it with an expression that builds the real congratulation prompt from the
   webhook payload:
   `Congratulate {{name}} on completing the {{challengeName}} challenge with a score of {{score}} in one upbeat sentence.`

3. **Gmail "Send a message" node had no credential attached either**, and its message field
   still read `{{ $json.choices[0].message.content }}` — that's the output shape of the *old*
   raw HTTP Request node, not the Basic LLM Chain node (which outputs `{{ $json.text }}`).
   **Fix:** attached the **"Gmail account 144"** OAuth2 credential and changed the message
   expression to `{{ $json.text }}`. Also had to add `resource: "message"` /
   `operation: "send"` explicitly — they were missing and n8n's validator rejected the node
   without them.

4. **The "If" node's false branch (wrong/missing secret) wasn't wired to anything.**
   A request with a bad or missing secret just died silently — no response — so the browser's
   `fetch()` would hang until it timed out, which looks exactly like "nothing happens" from the
   game's side.
   **Fix:** added a new **"Respond Unauthorized"** node (Respond to Webhook, HTTP 401,
   `Access-Control-Allow-Origin: *`) wired to the If node's false output, so bad requests get an
   immediate, clean rejection instead of a hang.

5. **Remaining blocker — OpenRouter account privacy/data policy setting.**
   After fixing 1–4, test runs against the real OpenRouter API failed with:
   > `404 No endpoints available matching your guardrail restrictions and data policy.`
   This happened with two different models (`openai/gpt-4o-mini` and the previous default), so
   it isn't a bad model slug — it's an **account-level setting**, not something fixable from the
   workflow. To fix it, log into OpenRouter and go to
   **openrouter.ai/settings/privacy**, then either enable providers that may train on/retain
   inputs, or narrow to a specific provider that fits your current policy. This is the one step
   only you can do (it needs your OpenRouter login) — everything else above is already fixed and
   the workflow is **active**.

The corrected workflow was re-exported to `Game-Completion-Certificate.json` in this folder
(replacing reliance on the older PDF-attachment variant, which is a separate, still-valid
option described above). Note: credential IDs are included by name for reference, but n8n never
exports the actual secret values — you'd still need to re-attach credentials if you ever
re-import this file into a different n8n instance.
