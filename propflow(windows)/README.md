# PROPFLOW

Property management portal for landlords, tenants, and contractors.
Your Figma Make design (React + Vite + Tailwind) wired to a Node + Express API and a SQLite database generated from `server/schema.dbml`.

Requires **Node 22.13 or newer** (uses Node's built-in SQLite, so there's no native build step).

## Run it (two terminals)

Run each command on its own line (this works on Mac, Linux, and Windows, including older Windows PowerShell that doesn't support `&&`).

**Terminal 1 — API** (http://localhost:3001)
```
cd server
npm install
npm start
```

**Terminal 2 — website** (http://localhost:5173, proxies /api to the API)
```
cd client
npm install
npm run dev
```

## Single server (production-style)

Build the site once, then start the server, which serves the site and the API on one port.
```
cd client
npm install
npm run build
cd ../server
```
Then start it with your settings. The syntax depends on your shell:

| Shell | Command |
|---|---|
| Mac / Linux | `JWT_SECRET=<long random string> SHOW_DEV_CODES=false npm start` |
| Windows PowerShell | `$env:JWT_SECRET="<long random string>"; $env:SHOW_DEV_CODES="false"; npm start` |
| Windows Command Prompt | `set JWT_SECRET=<long random string>` then `set SHOW_DEV_CODES=false` then `npm start` |

## Test it

Use a throwaway database so your real data isn't touched. Start the server in one terminal, run the checks in a second.

| Shell | Terminal 1 (server) | Terminal 2 (checks) |
|---|---|---|
| Mac / Linux | `DB_FILE=/tmp/test.db npm start` | `DB_FILE=/tmp/test.db node smoke.mjs` |
| Windows PowerShell | `$env:DB_FILE="$env:TEMP\test.db"; npm start` | `$env:DB_FILE="$env:TEMP\test.db"; node smoke.mjs` |

Run both from the `server` folder. The checks cover every feature and permission and should end with `82 passed, 0 failed`.

## What works

| Role | Features |
|---|---|
| Everyone | Sign up / sign in (bcrypt + JWT), forgot-password with emailed code, session restore |
| Landlord | Buildings and units, per-unit invite codes, add tenant by name, move-out (keeps history), rent tracker with live balances, 24-month payment history, rent reminders (email/SMS), maintenance requests with bid comparison (accept / decline), contractor access code, preferred / blocked contractors, document archive with upload and download |
| Tenant | Sign up with invite code + email verification, lease and rent status, Pay Now, payment history, maintenance requests, landlord notices, documents (view, upload, download) |
| Contractor | Connect to landlords by code, browse jobs, itemised bids (line items, timeline, warranty), active work orders with notes, before/after photos, invoice (numbered, printable), cash/card + mark paid, notifications |

## Where things live

| Piece | Location |
|---|---|
| Your schema (22 original tables unchanged, plus 8 added at the bottom) | `server/schema.dbml` |
| API | `server/server.js` |
| Uploaded files | `server/uploads/` |
| Screens | `client/src/pages`, `client/src/dashboards` |

## Before going live

These work in development but need real services:

- **Email / SMS:** codes and reminders go through `deliver()` in `server/server.js`, which currently logs to the console. Connect a provider (SendGrid, Twilio, SMTP) there, then set `SHOW_DEV_CODES=false` so codes are no longer shown on screen.
- **Online payments:** *Pay Now* records the payment but does not charge a card. Connect Stripe (or similar) before collecting real money.
- **Secrets and hosting:** set a long random `JWT_SECRET`, serve over HTTPS, and back up `server/propflow.db` and `server/uploads/`.
- **Other databases:** the SQL is generated from the DBML for SQLite. For PostgreSQL or MySQL, swap the data layer in `server/db.js`.

## Notes on the design

- Landlord = the "property manager" in your schema.
- Adding a tenant by name creates a placeholder account that is claimed automatically when the real tenant signs up with that unit's invite code.
- Rent schedules are generated for 12 months from the day a tenancy begins, due on the 1st.
- Removing a building hides it and ends its leases; rent and document history is kept.
- Not in the new design, so not built: late fees, expenses, GPS check-ins, materials, and work logs (the tables still exist in the schema).
