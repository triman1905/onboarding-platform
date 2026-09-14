# ABC Onboarding — Local Email Automation MVP

React (Vite/TanStack Start) frontend + **local** Node.js/Express backend with SQLite, Nodemailer
(Gmail SMTP) and node-cron. Email sending runs entirely on your machine — no Lovable runtime,
no cloud services required.

## 1. Requirements

- Node.js 20+ (Node 22.5+ recommended — the backend falls back to the built-in `node:sqlite`
  driver if the `better-sqlite3` native binding cannot load)
- npm
- A Gmail account with 2-Step Verification and an **App Password**

## 2. Installation

```sh
npm install
cp .env.example .env
npm run setup     # creates ./data/vanguard.sqlite and seeds templates + test batch
```

## 3. Environment variables (`.env`)

```
PORT=3001
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
DATABASE_PATH=./data/vanguard.sqlite
FRONTEND_URL=http://localhost:5173
```

`.env` is git-ignored. The app password is never sent to, or displayed in, the frontend.

## 4. Gmail App Password setup

1. Google Account → Security → enable 2-Step Verification
2. Security → App passwords → create one for "Mail"
3. Paste the 16-character value into `GMAIL_APP_PASSWORD`

## 5. Running

```sh
npm run dev      # frontend + backend together
```

or in two terminals:

```sh
npm run server   # http://localhost:3001
npm run client   # http://localhost:5173
```

## 6. Using the app

Open **Email Automation** in the sidebar.

1. **Import** — upload `sample-data/candidates-sample.csv`, validate (total / valid / invalid /
   duplicate + issue table), then import the valid rows into a new batch.
2. **Preview & send** — pick the batch and the *ABC Welcome Email* template, preview each
   personalized email (`{{first_name}}`, `{{joining_date}}`, `{{verification_link}}`, …), then
   confirm to send. Duplicate sends of the same template to the same candidate are skipped.
3. **Reminders** — schedule a reminder (name, template, date, time, Asia/Kolkata). The target is
   `Verification status = NOT_STARTED`; completed candidates are skipped with a logged reason.
4. **Email history** — per-email status (QUEUED / SENDING / SENT / FAILED), failure reason,
   attempt count and a Retry action.

Test the SMTP credentials any time with `POST /api/email/test` (also surfaced in the UI).

## 7. Scheduler limitation

Scheduled automation runs only while the local backend process is running. For production, deploy
the backend to an always-on server.

## 8. API endpoints

```
POST /api/batches/validate      POST /api/batches/import       GET /api/batches[/:id]
GET  /api/candidates[/:id]      POST /api/email/test           POST /api/email/send-batch
GET  /api/email/history         GET  /api/email/status         POST /api/email/retry/:id
GET  /api/templates             POST /api/templates            PUT  /api/templates/:id
GET  /api/templates/:id/preview POST /api/reminders            GET  /api/reminders[/:id]
POST /api/reminders/:id/cancel  POST /api/reminders/:id/run    POST /api/reminders/:id/send

GET  /api/communications/status        GET  /api/communications/status/:id
GET  /api/communications/history       GET  /api/communications/preview
POST /api/communications/whatsapp/send POST /api/communications/sms/send
POST /api/communications/bulk-send     POST /api/communications/:id/retry
POST /api/communications/twilio/status (Twilio delivery-status webhook)
```

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| "Local backend not running" banner | Start `npm run server`; check port 3001 is free |
| `Invalid login` on test connection | Use an App Password, not your Gmail password |
| `better-sqlite3` binding error | Harmless — the backend automatically uses `node:sqlite` |
| Reminder never fires | The backend must stay running; check the scheduler log line at startup |
| No emails sent | Confirm `GMAIL_USER` / `GMAIL_APP_PASSWORD` in `.env`, then restart the server |
| WhatsApp/SMS always `NOT_CONFIGURED` | Check `TWILIO_ACCOUNT_SID` (starts `AC…`), `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` / `TWILIO_SMS_FROM` — see §10 below |

## 10. WhatsApp + SMS automation (Twilio)

### Architecture

WhatsApp and SMS are added as **replaceable channel providers**, not hard-wired
into business logic:

```
Candidate Database
       ↓
communicationService.js  (CommunicationService)
       ↓
whatsappProvider.js / smsProvider.js   (provider interface + factory)
       ↓
twilioWhatsAppProvider.js / twilioSmsProvider.js   (current implementation)
       ↓
Twilio API
```

`reminderService.js` and the route handlers only ever call
`sendChannelsToCandidates()` / `getWhatsAppProvider()` / `getSmsProvider()` —
never the Twilio SDK directly. See §11 for what a future Meta WhatsApp
migration touches (only the provider layer).

### Setup

1. Create a [Twilio](https://www.twilio.com/) account (a trial account is enough for the prototype).
2. From the Twilio Console dashboard, copy:
   - **Account SID** — starts with `AC…` → `TWILIO_ACCOUNT_SID`
   - **Auth Token** — the 32-character hex value next to it → `TWILIO_AUTH_TOKEN`

   > ⚠️ Do not confuse the Auth Token with a **Content Template SID**
   > (starts with `HX…`) — that's a different value, used only for
   > `TWILIO_WHATSAPP_CONTENT_SID_*` below.
3. WhatsApp (Sandbox, for this prototype): Console → Messaging → Try it out →
   **Send a WhatsApp message**. Note the Sandbox number (e.g.
   `+14155238886`) → `TWILIO_WHATSAPP_FROM`.
4. SMS: buy or use a trial Twilio phone number with SMS capability →
   `TWILIO_SMS_FROM`.
5. Add all of the above to `server/.env` (see `.env.example`). Set
   `TWILIO_ENABLED=true`, `WHATSAPP_ENABLED=true`, `SMS_ENABLED=true`.
6. Restart `npm run server`.

### Twilio WhatsApp Sandbox limitations

- The Sandbox is **development/testing only** — it is not a production
  WhatsApp sender.
- **Every test recipient must join the Sandbox first**: they send the
  Sandbox's join code (e.g. `join <two-words>`) to the Sandbox WhatsApp
  number from their own phone. Only joined numbers can receive messages.
- Sandbox sessions are free-form only within a 24-hour window after the
  recipient's last message; this app sends free-form text by default, which
  matches what the Sandbox supports.
- Production WhatsApp requires an approved WhatsApp sender (via Twilio or
  Meta directly) and Meta-approved message templates — these are **separate**
  from the Sandbox's pre-approved test templates and require Twilio/Meta
  business verification. This app does not build any workaround for these
  restrictions.
- Set `TWILIO_WHATSAPP_CONTENT_SID_WELCOME` / `TWILIO_WHATSAPP_CONTENT_SID_REMINDER`
  once you have the matching Twilio Content API templates approved, and the
  provider automatically switches from free-form `body` to `contentSid` +
  `contentVariables` for that message type. If a candidate-facing template
  uses numbered placeholders (`{{1}}`, `{{2}}`, …), the candidate fields that
  fill them are declared per-template in
  `server/services/communication/channelTemplates.js` (`variableKeys`, e.g.
  `["first_name"]` → `{{1}}`) — that file is also the single place the UI's
  Email/WhatsApp/SMS template dropdowns and Communication History's
  "Template" column read their labels from, and the place a future
  database-backed template manager would replace. Leaving a message type's
  Content SID unset returns a clear `WHATSAPP_CONTENT_SID_MISSING` error
  instead of a bare Twilio "ContentSid Required" failure.

### Delivery status

If you expose the local backend on a public HTTPS URL (e.g. via `ngrok`
during a demo), set `TWILIO_STATUS_CALLBACK_URL` to
`https://<your-tunnel>/api/communications/twilio/status` and Twilio will push
QUEUED → SENT → DELIVERED → READ/FAILED updates back into Communication
History. Without it, sent messages stay at `SENT` (meaning "Twilio accepted
the request") — the app never claims `DELIVERED` on its own.

### Test mode

`TEST_MODE=true` (default) shows a **TEST MODE** badge in the UI as a
reminder to only send to known test recipients / Sandbox-joined numbers.
Set `TWILIO_ENABLED=false` at any time to disable WhatsApp + SMS entirely —
email automation keeps working unaffected.

## 11. Migrating WhatsApp from Twilio to Meta WhatsApp Business Platform later

The provider seam means the migration is additive:

1. Add `server/services/communication/providers/metaWhatsAppProvider.js`
   implementing the same `sendMessage({ to, text, contentSid, contentVariables, candidateId, reminderId, messageType })`
   interface as `twilioWhatsAppProvider.js`.
2. Add the Meta credentials (access token, phone number ID) as new env vars.
3. Map each logical message type (`WELCOME`, `REMINDER`) to its Meta-approved
   template name/language in `messageTemplates.js`.
4. Switch `getWhatsAppProvider()` in
   `server/services/communication/providers/whatsappProvider.js` to return
   `metaWhatsAppProvider` instead of `twilioWhatsAppProvider`.

None of the following need to change: the candidate database, `reminderService.js`,
the node-cron scheduler, the eligibility engine, Communication History, the
CSV/manual import flow, or the UI — they all talk to `channel` + `provider`
strings and the provider factory, not to Twilio.
