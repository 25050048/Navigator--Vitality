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
