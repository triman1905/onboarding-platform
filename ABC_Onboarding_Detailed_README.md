# ABC Onboarding — Detailed Setup Guide

This guide explains, in simple Windows-friendly steps, how to download, install, configure, start, and use the application.

> **Important:** This is a local setup. The application uses a local SQLite database, and scheduled automation works only while the backend is running.

## 1. What you need

- Windows computer
- Internet connection
- Node.js 20+ (Node.js 22.5+ recommended)
- npm
- Gmail account with 2-Step Verification and a Gmail App Password
- Project ZIP file

Check Node.js and npm in PowerShell:

```powershell
node --version
npm --version
```

## 2. Download the ZIP

Open the project repository:

https://github.com/triman1905/onboarding-platform

Then:

1. Click **Code**.
2. Click **Download ZIP**.
3. Save the ZIP, for example in Downloads.
4. Right-click it and choose **Extract All**.
5. Open the extracted folder.

**Do not run the commands from inside the ZIP. Extract it first.**

## 3. Open in VS Code

Open the extracted folder in VS Code.

You should see items such as:

- `src`
- `server`
- `shared`
- `sample-data`
- `package.json`
- `.env.example`

Open **Terminal → New Terminal**.

Check that you are in the project folder:

```powershell
pwd
dir
```

You should see `package.json`.

## 4. Install the software packages

Run:

```powershell
npm install
```

Wait until it finishes successfully.

## 5. Create the `.env` file

Find:

```text
.env.example
```

Make a copy and rename the copy to:

```text
.env
```

Keep `.env.example`. Do not delete it.

The `.env` file contains private settings and credentials. It should never be uploaded to GitHub.

## 6. Fill in `.env`

A typical local configuration is:

```env
PORT=3001
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
DATABASE_PATH=./data/vanguard.sqlite
FRONTEND_URL=http://localhost:5173
```

### PORT

Keep:

```env
PORT=3001
```

### GMAIL_USER

Replace the example with the Gmail account that will send the emails:

```env
GMAIL_USER=your-email@gmail.com
```

### GMAIL_APP_PASSWORD

Do **not** use the normal Gmail password. Use a Google App Password.

### DATABASE_PATH

Normally keep:

```env
DATABASE_PATH=./data/vanguard.sqlite
```

This is the local SQLite database.

### FRONTEND_URL

Normally keep:

```env
FRONTEND_URL=http://localhost:5173
```

## 7. Create a Gmail App Password

1. Sign in to the Google account that will send emails.
2. Open **Google Account → Security**.
3. Enable **2-Step Verification** if it is not already enabled.
4. Open **App passwords**.
5. Create an App Password for the application.
6. Google will provide a 16-character password.
7. Put that value into:

```env
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**Never use or share the normal Gmail password.**

If an App Password is exposed accidentally, revoke it and create a new one.

## 8. First-time database setup

After `npm install`, run:

```powershell
npm run setup
```

This prepares the local database and initial application data.

The database is stored under:

```text
data/
```

Do not delete the database file unless you intentionally want to reset the local data.

## 9. Start the application

The easiest command is:

```powershell
npm run dev
```

Wait for the frontend and backend to start.

Then open:

```text
http://localhost:5173
```

## 10. Alternative: two terminals

If you want to run them separately, use two VS Code terminals.

### Terminal 1 — backend

```powershell
npm run server
```

Backend:

```text
http://localhost:3001
```

### Terminal 2 — frontend

```powershell
npm run client
```

Frontend:

```text
http://localhost:5173
```

Then open the frontend address in your browser.

## 11. Keep the terminal running

Do not close the terminal while using the local application.

If you stop the backend:

- API requests stop working
- the application may show that the local backend is unavailable
- scheduled reminders/automation stop

Scheduled automation runs only while the local backend process is running.

## 12. Restart after changing `.env`

Whenever you change `.env`:

1. Go to the terminal running the application.
2. Press:

```text
Ctrl + C
```

3. Start it again:

```powershell
npm run dev
```

If running separately:

```powershell
npm run server
```

and:

```powershell
npm run client
```

## 13. Importing candidates

A sample file is available here:

```text
sample-data/candidates-sample.csv
```

Typical workflow:

1. Open the candidate/batch import area.
2. Upload the CSV.
3. Validate the file.
4. Review valid and invalid records.
5. Import valid records into a batch.
6. Continue with the required automation.

## 14. Email automation

The application supports:

- Candidate import
- File validation
- Batch creation
- Personalized email preview
- Email sending
- Email history
- Scheduled reminders
- Retry of failed emails

The application can personalize messages using candidate information such as name, joining date, and verification link.

## 15. Test the email connection

If the application provides an email connection test, run it before sending real emails.

The backend test endpoint is:

```text
POST /api/email/test
```

If it fails, check:

```env
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
```

Make sure you used an App Password rather than the normal Gmail password.

Restart the backend after correcting `.env`.

## 16. WhatsApp and SMS

WhatsApp and SMS can be configured through Twilio for testing.

Relevant settings may include:

```env
TWILIO_ENABLED=true
WHATSAPP_ENABLED=true
SMS_ENABLED=true
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=your-whatsapp-sender
TWILIO_SMS_FROM=your-sms-number
```

Do not guess these values. They must come from the approved Twilio account.

For company use, credentials should be provided through the organization's approved secure process.

## 17. Twilio setup

For testing:

1. Obtain access to the approved Twilio account.
2. Open the Twilio Console.
3. Copy the **Account SID**.
4. Copy the **Auth Token**.
5. Configure the WhatsApp sender.
6. Configure an SMS-capable number.
7. Add the values to the appropriate `.env`.
8. Restart the backend.

Example:

```env
TWILIO_ENABLED=true
WHATSAPP_ENABLED=true
SMS_ENABLED=true
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=your-whatsapp-sender
TWILIO_SMS_FROM=your-sms-number
```

## 18. WhatsApp Sandbox limitation

If using the Twilio WhatsApp Sandbox:

- It is intended for development/testing.
- Test recipients normally need to join the Sandbox first.
- It is not a production company WhatsApp sender.
- Production WhatsApp requires an approved sender and approved message templates.

## 19. If the company wants Meta WhatsApp

For production Meta WhatsApp Business integration, the organization would need to provide the appropriate approved business access and credentials, for example:

- Meta Business account access
- WhatsApp Business account
- Approved WhatsApp phone number
- Phone Number ID
- Access token
- Approved message templates
- Required permissions/business verification

These credentials should be obtained through the organization's approved process.

## 20. Protect `.env`

Never:

- Upload `.env` to GitHub
- Put passwords or tokens directly in source code
- Share credentials in screenshots
- Paste company secrets into chat
- Commit secrets to Git

Always:

- Keep `.env` private
- Use `.env.example` as the template
- Rotate credentials if they are exposed

## 21. If a secret is exposed

### Gmail

Revoke the exposed App Password and create a new one.

### Twilio

Rotate/regenerate the exposed credential through the approved Twilio account process.

### Other API keys

Revoke the exposed key and create a new one.

Then update `.env` and restart the application.

## 22. Common problems

### `npm` is not recognized

Install Node.js 20+ and reopen VS Code.

Check:

```powershell
node --version
npm --version
```

### `package.json` cannot be found

You are probably in the wrong folder.

Run:

```powershell
dir
```

You should see `package.json`.

### Local backend is not running

Run:

```powershell
npm run server
```

or:

```powershell
npm run dev
```

### Port 3001 is already in use

Another backend process may already be running. Stop the old process/terminal and start again.

### Email login fails

Check:

- 2-Step Verification is enabled
- You used a Gmail App Password
- You did not use the normal Gmail password
- `GMAIL_USER` is correct
- `GMAIL_APP_PASSWORD` is correct
- You restarted the backend after changing `.env`

### No emails are sent

Check the Gmail credentials, connection test, backend terminal messages, and candidate email addresses.

### WhatsApp/SMS says `NOT_CONFIGURED`

Check the Twilio variables and make sure the related `*_ENABLED` settings are true. Then restart the backend.

### Reminder does not run

The backend must remain running for scheduled automation to execute.

## 23. Database and data

The application uses a local SQLite database:

```text
data/vanguard.sqlite
```

Candidate, batch, assignment, BGV, remarks, and related application data are stored there.

Do not delete this file unless you intentionally want to reset the local data.

For important data, follow the organization's backup and data-retention policy.

## 24. Important point about multiple users

This local setup is mainly for development/testing on the computer where the backend is running.

If multiple people need to use the same live system and see the same saved changes, the backend and database should be hosted on a shared, always-available environment.

For production, the organization should provide an approved server/hosting environment and the required company integrations.

## 25. Daily startup

If everything has already been installed:

1. Open the project in VS Code.
2. Open Terminal.
3. Run:

```powershell
npm run dev
```

4. Wait for startup to finish.
5. Open:

```text
http://localhost:5173
```

6. Keep the terminal running.

## 26. Shutdown

When finished:

1. Go to the running terminal.
2. Press:

```text
Ctrl + C
```

The database remains saved unless it is deleted.

## 27. Quick command list

First-time setup:

```powershell
npm install
npm run setup
```

Start everything:

```powershell
npm run dev
```

Backend only:

```powershell
npm run server
```

Frontend only:

```powershell
npm run client
```

Stop:

```text
Ctrl + C
```

Check Node.js:

```powershell
node --version
```

Check npm:

```powershell
npm --version
```

## 28. Final checklist

- [ ] ZIP downloaded
- [ ] ZIP extracted
- [ ] Project opened in VS Code
- [ ] `package.json` visible
- [ ] Node.js 20+ installed
- [ ] `npm install` completed
- [ ] `.env` created from `.env.example`
- [ ] Gmail account configured
- [ ] Gmail App Password configured
- [ ] Database path configured
- [ ] `npm run setup` completed for first-time setup
- [ ] `npm run dev` started successfully
- [ ] `http://localhost:5173` opens
- [ ] Backend is running
- [ ] Email connection tested before sending real emails
- [ ] Company communication credentials are added only through approved secure processes
- [ ] `.env` is not uploaded to GitHub

## 29. Production/company requirements

This document describes the local development/testing setup.

Before production use with real company/candidate data, the organization should provide and approve:

- Production hosting/server
- Company email account and required permissions
- Approved WhatsApp Business integration
- Approved SMS provider/account
- Required API credentials
- Security and access requirements
- Backup and data-retention requirements
- Appropriate user accounts and permissions

All company credentials should be provided and stored through the organization's approved secure process.

## One-line summary

**Download ZIP → extract → open in VS Code → `npm install` → create/fill `.env` → `npm run setup` → `npm run dev` → open `http://localhost:5173`.**
