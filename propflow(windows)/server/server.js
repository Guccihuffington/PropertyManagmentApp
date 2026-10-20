import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, all, get, run } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SHOW_DEV_CODES = process.env.SHOW_DEV_CODES !== 'false'; // set false once real email/SMS is connected
const UPLOADS = fileURLToPath(new URL('./uploads/', import.meta.url));
fs.mkdirSync(UPLOADS + 'photos', { recursive: true });
fs.mkdirSync(UPLOADS + 'docs', { recursive: true });

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/uploads/photos', express.static(UPLOADS + 'photos'));

/* ---------- helpers ---------- */
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const fail = (status, message) => Object.assign(new Error(message), { status });
const h = (fn) => (req, res) => {
  try { res.json(fn(req, res) ?? { ok: true }); }
  catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }); }
};
const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for your role.' });
    next();
  } catch { res.status(401).json({ error: 'Please sign in.' }); }
};
const need = (b, ...keys) => { for (const k of keys) if (b[k] === undefined || b[k] === null || String(b[k]).trim() === '') throw fail(400, `${k} is required.`); };
const num = (v, name) => { const n = Number(v); if (!(n > 0)) throw fail(400, `${name} must be a positive number.`); return Math.round(n * 100) / 100; };
const r2 = (n) => Math.round(n * 100) / 100;
const notify = (userId, title, message, type, entityId, entityType) => run(
  'INSERT INTO Notifications (UserID,Title,Message,Type,CreatedDate,RelatedEntityID,RelatedEntityType) VALUES (?,?,?,?,?,?,?)',
  userId, title, message, type, now(), entityId ?? null, entityType ?? null);
// Email/SMS delivery hook. Wire a provider (SendGrid, Twilio, SMTP...) in here; for now it logs.
const deliver = (channel, to, subject, body) => console.log(`[deliver:${channel}] to=${to} | ${subject} | ${body.replace(/\n/g, ' ').slice(0, 120)}`);

const fmtDay = (d) => new Date(d.length === 10 ? d + 'T00:00:00Z' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtStamp = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const code = (digits) => String(crypto.randomInt(10 ** (digits - 1), 10 ** digits));

const tenantId = (uid) => get('SELECT TenantID FROM Tenants WHERE UserID=?', uid)?.TenantID;
const contractorOf = (uid) => get('SELECT EmployeeID, ContractorID FROM ContractorEmployees WHERE UserID=?', uid);
const publicUser = (u) => ({
  id: u.UserID, name: u.FullName, email: u.Email, role: u.Role, phone: u.Phone,
  company: u.Role === 'contractor' ? get('SELECT c.CompanyName FROM Contractors c JOIN ContractorEmployees e ON e.ContractorID=c.ContractorID WHERE e.UserID=?', u.UserID)?.CompanyName : undefined });
const session = (u) => ({ token: jwt.sign({ id: u.UserID, role: u.Role }, SECRET, { expiresIn: '7d' }), user: publicUser(u) });
const mine = (uid, leaseId) => get(`SELECT 1 FROM Leases l JOIN Units u ON u.UnitID=l.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID WHERE l.LeaseID=? AND p.PropertyManagerID=?`, leaseId, uid);

/* ---------- one-time codes (email verification / password reset) ---------- */
const putCode = (purpose, email) => {
  const c = code(6);
  run('INSERT OR REPLACE INTO Codes (CodeKey,Code,ExpiresAt) VALUES (?,?,?)', `${purpose}:${email}`, c, new Date(Date.now() + 10 * 60000).toISOString());
  deliver('email', email, purpose === 'verify' ? 'Your PROPFLOW verification code' : 'Your PROPFLOW password reset code', `Your code is ${c}. It expires in 10 minutes.`);
  return c;
};
const checkCode = (purpose, email, given) => {
  const row = get('SELECT * FROM Codes WHERE CodeKey=?', `${purpose}:${email}`);
  if (!row || row.ExpiresAt < now() || row.Code !== String(given || '').trim()) throw fail(400, 'Incorrect or expired code. Please try again.');
  run('DELETE FROM Codes WHERE CodeKey=?', `${purpose}:${email}`);
};

/* ---------- rent ledger ---------- */
const ledger = (leaseId) => all(
  `SELECT r.RentScheduleID, r.DueDate, r.AmountDue,
     COALESCE((SELECT SUM(AmountPaid) FROM PaymentHistory p WHERE p.RentScheduleID=r.RentScheduleID),0) AS Paid,
     (SELECT MAX(PaymentDate) FROM PaymentHistory p WHERE p.RentScheduleID=r.RentScheduleID) AS LastPaid
   FROM RentSchedule r WHERE r.LeaseID=? ORDER BY r.DueDate`, leaseId);
const rentStatus = (leaseId) => {
  const rows = ledger(leaseId), t = today();
  const overdue = rows.filter((r) => r.DueDate <= t && r.Paid + 0.004 < r.AmountDue);
  const dueRows = rows.filter((r) => r.DueDate <= t);
  const next = rows.find((r) => r.DueDate > t && r.Paid + 0.004 < r.AmountDue);
  const lastPaid = rows.map((r) => r.LastPaid).filter(Boolean).sort().pop() || null;
  const paid = overdue.length === 0 && (dueRows.length > 0 || (rows[0] && rows[0].Paid + 0.004 >= rows[0].AmountDue));
  return { rows, overdueMonths: overdue.length, balance: r2(overdue.reduce((s, r) => s + r.AmountDue - r.Paid, 0)), paid, paidDate: lastPaid ? fmtDay(lastPaid) : null, next };
};
const applyPayment = (leaseId, amount, method) => {
  let left = amount;
  db.transaction(() => {
    for (const r of ledger(leaseId)) {
      const owed = r2(r.AmountDue - r.Paid);
      if (left <= 0.004 || owed <= 0.004) continue;
      const pay = Math.min(left, owed);
      run('INSERT INTO PaymentHistory (RentScheduleID,PaymentDate,AmountPaid,PaymentMethod) VALUES (?,?,?,?)', r.RentScheduleID, now(), pay, method);
      left = r2(left - pay);
    }
    if (left > 0.004) throw fail(400, 'That payment is more than the rent still owed on this lease.');
  })();
};
const createLease = (unitId, tenantIdValue, rent) => db.transaction(() => {
  const t = new Date();
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 12, 0));
  const id = run('INSERT INTO Leases (UnitID,StartDate,EndDate,MonthlyRent,Status) VALUES (?,?,?,?,?)', unitId, today(), last.toISOString().slice(0, 10), rent, 'Active').lastInsertRowid;
  run('INSERT INTO LeaseTenants (LeaseID,TenantID) VALUES (?,?)', id, tenantIdValue);
  for (let i = 0; i < 12; i++) run('INSERT INTO RentSchedule (LeaseID,DueDate,AmountDue) VALUES (?,?,?)', id, new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)).toISOString().slice(0, 10), rent);
  return id;
})();
const defaultRent = (unitId) => {
  const u = get('SELECT PropertyID, MonthlyBaseRent FROM Units WHERE UnitID=?', unitId);
  if (u.MonthlyBaseRent > 0) return u.MonthlyBaseRent;
  return Math.round(get(`SELECT AVG(l.MonthlyRent) AS a FROM Leases l JOIN Units x ON x.UnitID=l.UnitID WHERE x.PropertyID=? AND l.Status='Active'`, u.PropertyID).a || 0);
};

/* ---------- auth ---------- */
app.post('/api/auth/send-code', h(({ body: b }) => {
  const email = String(b.email || '').trim().toLowerCase();
  if (!email) throw fail(400, 'Enter your email.');
  if (b.purpose === 'reset') {
    if (!get('SELECT 1 FROM Users WHERE Email=?', email)) return { ok: true };  // don't reveal which emails exist
    return { ok: true, devCode: SHOW_DEV_CODES ? putCode('reset', email) : undefined };
  }
  if (get('SELECT 1 FROM Users WHERE Email=?', email)) throw fail(409, 'An account with this email already exists.');
  return { ok: true, devCode: SHOW_DEV_CODES ? putCode('verify', email) : undefined };
}));

app.get('/api/invites/:code', h(({ params }) => {
  const r = get(`SELECT p.Address AS address, u.UnitNumber AS unit FROM UnitInvites i JOIN Units u ON u.UnitID=i.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID WHERE i.Code=?`, params.code);
  if (!r) throw fail(404, 'Invalid invite code.');
  return r;
}));

app.post('/api/auth/register', h(({ body: b }) => {
  const email = String(b.email || '').trim().toLowerCase();
  if (!b.name?.trim() || !email || String(b.password || '').length < 6) throw fail(400, 'Enter your name, email, and a password of at least 6 characters.');
  if (!['tenant', 'landlord', 'contractor'].includes(b.role)) throw fail(400, 'Invalid role.');
  if (b.role === 'tenant' && !b.phone?.trim()) throw fail(400, 'A phone number is required for tenant accounts.');
  if (get('SELECT 1 FROM Users WHERE Email=?', email)) throw fail(409, 'An account with this email already exists.');
  let invite = null;
  if (b.role === 'tenant') {
    checkCode('verify', email, b.verifyCode);
    if (b.inviteCode?.trim()) { invite = get('SELECT UnitID FROM UnitInvites WHERE Code=?', b.inviteCode.trim()); if (!invite) throw fail(400, 'Invalid invite code.'); }
  }
  return db.transaction(() => {
    const uid = run('INSERT INTO Users (FullName,Email,PasswordHash,Role,Phone) VALUES (?,?,?,?,?)', b.name.trim(), email, bcrypt.hashSync(b.password, 10), b.role, b.phone?.trim() || null).lastInsertRowid;
    if (b.role === 'tenant') {
      const tid = run('INSERT INTO Tenants (UserID) VALUES (?)', uid).lastInsertRowid;
      if (invite) joinUnit(invite.UnitID, tid);
    }
    if (b.role === 'contractor') {
      const c = run('INSERT INTO Contractors (CompanyName,Phone,Email) VALUES (?,?,?)', b.company?.trim() || b.name.trim(), b.phone?.trim() || null, email).lastInsertRowid;
      run('INSERT INTO ContractorEmployees (ContractorID,UserID) VALUES (?,?)', c, uid);
    }
    return session(get('SELECT * FROM Users WHERE UserID=?', uid));
  })();
}));

// A tenant signs up with a unit's invite code: claim a landlord-created placeholder tenant, join as co-tenant, or start a lease.
function joinUnit(unitId, newTenantId) {
  const lease = get(`SELECT LeaseID FROM Leases WHERE UnitID=? AND Status='Active'`, unitId);
  if (!lease) return createLeaseFor(unitId, newTenantId);
  const ph = get(`SELECT t.TenantID, t.UserID FROM LeaseTenants lt JOIN Tenants t ON t.TenantID=lt.TenantID JOIN Users u ON u.UserID=t.UserID WHERE lt.LeaseID=? AND u.Email LIKE '%@placeholder.invalid'`, lease.LeaseID);
  if (ph) {
    run('UPDATE LeaseTenants SET TenantID=? WHERE LeaseID=? AND TenantID=?', newTenantId, lease.LeaseID, ph.TenantID);
    run('UPDATE MaintenanceRequests SET TenantID=? WHERE TenantID=?', newTenantId, ph.TenantID);
    run('DELETE FROM Tenants WHERE TenantID=?', ph.TenantID);
    run('DELETE FROM Users WHERE UserID=?', ph.UserID);
  } else run('INSERT OR IGNORE INTO LeaseTenants (LeaseID,TenantID) VALUES (?,?)', lease.LeaseID, newTenantId);
}
const createLeaseFor = (unitId, tid) => createLease(unitId, tid, defaultRent(unitId));

app.post('/api/auth/login', h(({ body: b }) => {
  const u = get('SELECT * FROM Users WHERE Email=?', String(b.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(b.password || ''), u.PasswordHash)) throw fail(401, 'No account matches that email and password.');
  return session(u);
}));
app.post('/api/auth/reset', h(({ body: b }) => {
  const email = String(b.email || '').trim().toLowerCase();
  if (String(b.password || '').length < 6) throw fail(400, 'Password must be at least 6 characters.');
  checkCode('reset', email, b.code);
  run('UPDATE Users SET PasswordHash=? WHERE Email=?', bcrypt.hashSync(b.password, 10), email);
}));
app.get('/api/auth/me', auth(), h(({ user }) => {
  const u = get('SELECT * FROM Users WHERE UserID=?', user.id);
  if (!u) throw fail(401, 'Please sign in.');
  return publicUser(u);
}));

/* ---------- landlord: portfolio ---------- */
app.get('/api/portfolio', auth('landlord'), h(({ user }) => {
  const props = all(`SELECT PropertyID, Address FROM Properties WHERE PropertyManagerID=? AND PropertyID NOT IN (SELECT PropertyID FROM RemovedProperties) ORDER BY Address`, user.id);
  const properties = props.map((p) => {
    const units = all('SELECT UnitID, UnitNumber FROM Units WHERE PropertyID=? ORDER BY UnitNumber', p.PropertyID);
    const tenants = [], vacant = [];
    for (const u of units) {
      const l = get(`SELECT LeaseID, MonthlyRent FROM Leases WHERE UnitID=? AND Status='Active'`, u.UnitID);
      if (!l) { vacant.push({ unitId: u.UnitID, label: u.UnitNumber, inviteCode: get('SELECT Code FROM UnitInvites WHERE UnitID=?', u.UnitID)?.Code || null }); continue; }
      const s = rentStatus(l.LeaseID);
      const names = all(`SELECT us.FullName FROM LeaseTenants lt JOIN Tenants t ON t.TenantID=lt.TenantID JOIN Users us ON us.UserID=t.UserID WHERE lt.LeaseID=?`, l.LeaseID).map((x) => x.FullName).join(', ');
      tenants.push({ leaseId: l.LeaseID, name: names, unit: u.UnitNumber, rent: l.MonthlyRent, paid: s.paid, paidDate: s.paidDate, overdueMonths: s.overdueMonths });
    }
    return { propertyId: p.PropertyID, address: p.Address, units: units.length, tenants, vacant };
  });
  let lc = get('SELECT Code FROM LandlordCodes WHERE ManagerID=?', user.id)?.Code;
  if (!lc) { do { lc = code(8); } while (get('SELECT 1 FROM LandlordCodes WHERE Code=?', lc)); run('INSERT INTO LandlordCodes (ManagerID,Code) VALUES (?,?)', user.id, lc); }
  const st = all(`SELECT e.UserID, lc.Status FROM LandlordContractors lc JOIN ContractorEmployees e ON e.ContractorID=lc.ContractorID WHERE lc.ManagerID=?`, user.id);
  return { properties, code: lc, preferred: st.filter((s) => s.Status === 'preferred').map((s) => s.UserID), blocked: st.filter((s) => s.Status === 'blocked').map((s) => s.UserID) };
}));

app.post('/api/buildings', auth('landlord'), h(({ user, body: b }) => {
  need(b, 'address');
  const n = Math.min(200, Math.max(1, parseInt(b.units) || 1));
  return db.transaction(() => {
    const pid = run(`INSERT INTO Properties (PropertyManagerID,PropertyName,Address,City,State,ZipCode) VALUES (?,?,?,?,?,?)`, user.id, b.address.trim(), b.address.trim(), '', '', '').lastInsertRowid;
    for (let i = 0; i < n; i++) run('INSERT INTO Units (PropertyID,UnitNumber,MonthlyBaseRent) VALUES (?,?,?)', pid, `Unit ${i < 26 ? String.fromCharCode(65 + i) : i + 1}`, 0);
    return { id: pid };
  })();
}));
app.delete('/api/buildings/:id', auth('landlord'), h(({ user, params }) => {
  if (!get('SELECT 1 FROM Properties WHERE PropertyID=? AND PropertyManagerID=?', params.id, user.id)) throw fail(404, 'Building not found.');
  db.transaction(() => {  // hidden rather than erased, so rent and document history is kept
    run(`UPDATE Leases SET Status='Ended' WHERE Status='Active' AND UnitID IN (SELECT UnitID FROM Units WHERE PropertyID=?)`, params.id);
    run('INSERT OR IGNORE INTO RemovedProperties (PropertyID) VALUES (?)', params.id);
  })();
}));

app.post('/api/units/:id/invite', auth('landlord'), h(({ user, params }) => {
  if (!get('SELECT 1 FROM Units u JOIN Properties p ON p.PropertyID=u.PropertyID WHERE u.UnitID=? AND p.PropertyManagerID=?', params.id, user.id)) throw fail(404, 'Unit not found.');
  let c = get('SELECT Code FROM UnitInvites WHERE UnitID=?', params.id)?.Code;
  if (!c) { do { c = code(8); } while (get('SELECT 1 FROM UnitInvites WHERE Code=?', c)); run('INSERT INTO UnitInvites (UnitID,Code) VALUES (?,?)', params.id, c); }
  return { code: c };
}));

// Landlord adds a tenant by name; they get a placeholder account that is claimed when the real tenant signs up with the unit's invite code.
app.post('/api/tenants', auth('landlord'), h(({ user, body: b }) => {
  need(b, 'unitId', 'name');
  if (!get('SELECT 1 FROM Units u JOIN Properties p ON p.PropertyID=u.PropertyID WHERE u.UnitID=? AND p.PropertyManagerID=?', b.unitId, user.id)) throw fail(404, 'Unit not found.');
  if (get(`SELECT 1 FROM Leases WHERE UnitID=? AND Status='Active'`, b.unitId)) throw fail(409, 'This unit already has a tenant.');
  return db.transaction(() => {
    const uid = run('INSERT INTO Users (FullName,Email,PasswordHash,Role) VALUES (?,?,?,?)', b.name.trim(), `pending-${crypto.randomUUID()}@placeholder.invalid`, '!', 'tenant').lastInsertRowid;
    const tid = run('INSERT INTO Tenants (UserID) VALUES (?)', uid).lastInsertRowid;
    return { leaseId: createLease(Number(b.unitId), tid, Number(b.rent) > 0 ? num(b.rent, 'rent') : defaultRent(b.unitId)) };
  })();
}));
app.post('/api/leases/:id/vacate', auth('landlord'), h(({ user, params }) => {
  if (!mine(user.id, params.id)) throw fail(404, 'Lease not found.');
  db.transaction(() => {
    run(`UPDATE Leases SET Status='Ended' WHERE LeaseID=?`, params.id);
    run(`DELETE FROM RentSchedule WHERE LeaseID=? AND DueDate>? AND NOT EXISTS (SELECT 1 FROM PaymentHistory p WHERE p.RentScheduleID=RentSchedule.RentScheduleID)`, params.id, today());
  })();
}));
app.get('/api/leases/:id/payments', auth('landlord'), h(({ user, params }) => {
  if (!mine(user.id, params.id)) throw fail(404, 'Lease not found.');
  return ledger(params.id).filter((r) => r.DueDate <= today()).reverse().map((r) => {
    if (r.Paid + 0.004 < r.AmountDue) return { month: fmtMonth(r.DueDate).replace(/^(\w{3})\w*/, '$1'), amount: r.AmountDue, status: 'Overdue', overdueDays: Math.max(1, Math.round((Date.now() - Date.parse(r.DueDate)) / 864e5)) };
    const late = Math.round((Date.parse(r.LastPaid) - Date.parse(r.DueDate)) / 864e5);
    return { month: fmtMonth(r.DueDate).replace(/^(\w{3})\w*/, '$1'), amount: r.AmountDue, status: late > 3 ? 'Late' : 'Paid', overdueDays: late > 3 ? late : 0 };
  });
}));
app.post('/api/reminders', auth('landlord'), h(({ user, body: b }) => {
  need(b, 'leaseId', 'message');
  if (!mine(user.id, b.leaseId)) throw fail(404, 'Lease not found.');
  for (const t of all(`SELECT u.UserID, u.Email, u.Phone, u.Email LIKE '%@placeholder.invalid' AS ph FROM LeaseTenants lt JOIN Tenants t ON t.TenantID=lt.TenantID JOIN Users u ON u.UserID=t.UserID WHERE lt.LeaseID=?`, b.leaseId)) {
    notify(t.UserID, 'Rent reminder', b.message, 'Reminder', b.leaseId, 'Lease');
    if (!t.ph) deliver(b.channel === 'sms' ? 'sms' : 'email', b.channel === 'sms' ? t.Phone : t.Email, 'Rent reminder', b.message);
  }
}));

/* ---------- landlord/contractor connections ---------- */
app.post('/api/landlord/contractors/:userId', auth('landlord'), h(({ user, params, body: b }) => {
  const e = get('SELECT ContractorID FROM ContractorEmployees WHERE UserID=?', params.userId);
  if (!e || !['connected', 'preferred', 'blocked'].includes(b.status)) throw fail(400, 'Invalid request.');
  run('INSERT OR REPLACE INTO LandlordContractors (ManagerID,ContractorID,Status) VALUES (?,?,?)', user.id, e.ContractorID, b.status);
}));
app.get('/api/contractor/landlords', auth('contractor'), h(({ user }) => {
  const c = contractorOf(user.id);
  return all(`SELECT lc.ManagerID AS id, u.FullName AS name FROM LandlordContractors lc JOIN Users u ON u.UserID=lc.ManagerID WHERE lc.ContractorID=? AND lc.Status<>'blocked'`, c.ContractorID)
    .map((l) => ({ ...l, properties: all(`SELECT Address FROM Properties WHERE PropertyManagerID=? AND PropertyID NOT IN (SELECT PropertyID FROM RemovedProperties)`, l.id).map((p) => p.Address) }));
}));
app.post('/api/contractor/connect', auth('contractor'), h(({ user, body: b }) => {
  const l = get('SELECT ManagerID FROM LandlordCodes WHERE Code=?', String(b.code || '').trim());
  if (!l) throw fail(404, 'Invalid code. Please check with your landlord.');
  const c = contractorOf(user.id), ex = get('SELECT Status FROM LandlordContractors WHERE ManagerID=? AND ContractorID=?', l.ManagerID, c.ContractorID);
  if (ex?.Status === 'blocked') throw fail(404, 'Invalid code. Please check with your landlord.');
  if (ex) throw fail(409, "You're already connected to this landlord.");
  run(`INSERT INTO LandlordContractors (ManagerID,ContractorID,Status) VALUES (?,?,'connected')`, l.ManagerID, c.ContractorID);
}));

/* ---------- maintenance requests & bids ---------- */
const RID = (id) => `MR-${id}`;
const rawId = (s) => Number(String(s).replace(/\D/g, ''));
const photoRows = (woId) => all('SELECT PhotoID, PhotoURL, PhotoType FROM WorkPhotos WHERE WorkOrderID=? ORDER BY PhotoID', woId);

app.get('/api/requests', auth(), h(({ user }) => {
  const base = `SELECT m.RequestID, m.Description, m.Priority, m.Status, m.CreatedDate, p.Address, p.PropertyManagerID, (SELECT FullName FROM Users WHERE UserID=p.PropertyManagerID) AS Landlord, u.UnitNumber, us.FullName AS Tenant, pr.ProjectID
    FROM MaintenanceRequests m JOIN Units u ON u.UnitID=m.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID
    LEFT JOIN Tenants t ON t.TenantID=m.TenantID LEFT JOIN Users us ON us.UserID=t.UserID LEFT JOIN MaintenanceProjects pr ON pr.RequestID=m.RequestID`;
  let rows, me = null;
  if (user.role === 'landlord') rows = all(`${base} WHERE p.PropertyManagerID=? ORDER BY m.RequestID DESC`, user.id);
  else if (user.role === 'tenant') rows = all(`${base} WHERE m.TenantID=? ORDER BY m.RequestID DESC`, tenantId(user.id));
  else {
    me = contractorOf(user.id);
    rows = all(`${base} WHERE (m.Status IN ('Open','Bidding') AND EXISTS (SELECT 1 FROM LandlordContractors lc WHERE lc.ManagerID=p.PropertyManagerID AND lc.ContractorID=? AND lc.Status<>'blocked'))
      OR EXISTS (SELECT 1 FROM ContractorBids b WHERE b.ProjectID=pr.ProjectID AND b.ContractorID=?) ORDER BY m.RequestID DESC`, me.ContractorID, me.ContractorID);
  }
  return rows.map((m) => {
    const bids = !m.ProjectID ? [] : all(`SELECT b.BidID, b.ContractorID, b.Amount, b.Description, b.Status, c.CompanyName,
        (SELECT UserID FROM ContractorEmployees WHERE ContractorID=b.ContractorID LIMIT 1) AS UserID, d.EstimatedDays, d.Warranty, d.LineItems
      FROM ContractorBids b JOIN Contractors c ON c.ContractorID=b.ContractorID LEFT JOIN BidDetails d ON d.BidID=b.BidID
      WHERE b.ProjectID=? ${me ? 'AND b.ContractorID=' + me.ContractorID : ''} ORDER BY b.BidID`, m.ProjectID)
      .map((b) => ({ id: `bid-${b.BidID}`, contractorId: b.UserID, contractorName: b.CompanyName, price: b.Amount, note: b.Description || '', status: b.Status, lineItems: JSON.parse(b.LineItems || '[]'), estimatedDays: b.EstimatedDays || '', warranty: b.Warranty || '' }));
    const accepted = bids.find((b) => b.status === 'Accepted');
    const out = { id: RID(m.RequestID), address: m.Address, unit: m.UnitNumber, landlord: m.Landlord, issue: m.Description, priority: m.Priority, status: m.Status, bids, tenant: m.Tenant,
      date: new Date(m.CreatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), acceptedBidId: accepted?.id };
    const wo = accepted && m.ProjectID && get('SELECT WorkOrderID FROM WorkOrders WHERE ProjectID=? ORDER BY WorkOrderID DESC', m.ProjectID);
    if (wo && me && accepted.contractorId === user.id) {
      const jd = get('SELECT * FROM JobDetails WHERE WorkOrderID=?', wo.WorkOrderID);
      const ph = photoRows(wo.WorkOrderID);
      out.job = { workOrderId: wo.WorkOrderID, completionNotes: jd?.CompletionNotes || '', paymentMethod: jd?.PaymentMethod || null, paid: !!jd?.Paid,
        photos: { before: ph.filter((p) => p.PhotoType === 'before').map((p) => ({ id: p.PhotoID, url: p.PhotoURL })), after: ph.filter((p) => p.PhotoType === 'after').map((p) => ({ id: p.PhotoID, url: p.PhotoURL })) } };
    }
    return out;
  });
}));

app.post('/api/requests', auth('tenant'), h(({ user, body: b }) => {
  need(b, 'description');
  const tid = tenantId(user.id);
  const l = get(`SELECT l.UnitID FROM Leases l JOIN LeaseTenants lt ON lt.LeaseID=l.LeaseID WHERE lt.TenantID=? AND l.Status='Active'`, tid);
  if (!l) throw fail(400, 'You need to be linked to a unit before you can submit a request.');
  const tags = [b.room, b.type].filter(Boolean).join(' · ');
  const text = tags ? `${b.description.trim()} (${tags})` : b.description.trim();
  const mgr = get('SELECT p.PropertyManagerID AS id FROM Units u JOIN Properties p ON p.PropertyID=u.PropertyID WHERE u.UnitID=?', l.UnitID).id;
  return db.transaction(() => {
    const id = run('INSERT INTO MaintenanceRequests (UnitID,TenantID,Description,Priority,Status,CreatedDate) VALUES (?,?,?,?,?,?)',
      l.UnitID, tid, text, ['Low', 'Medium', 'High'].includes(b.priority) ? b.priority : 'Medium', 'Open', now()).lastInsertRowid;
    run('INSERT INTO MaintenanceProjects (RequestID,PropertyManagerID,Description,Status) VALUES (?,?,?,?)', id, mgr, text, 'Open');
    notify(mgr, 'New maintenance request', text.slice(0, 120), 'Request', id, 'MaintenanceRequest');
    return { id: RID(id) };
  })();
}));

app.post('/api/requests/:id/bids', auth('contractor'), h(({ user, params, body: b }) => {
  const c = contractorOf(user.id), rid = rawId(params.id);
  const m = get(`SELECT m.*, pr.ProjectID, p.PropertyManagerID AS Mgr FROM MaintenanceRequests m JOIN MaintenanceProjects pr ON pr.RequestID=m.RequestID JOIN Units u ON u.UnitID=m.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID WHERE m.RequestID=?`, rid);
  if (!m || !['Open', 'Bidding'].includes(m.Status)) throw fail(404, 'This job is no longer open for bids.');
  const lc = get('SELECT Status FROM LandlordContractors WHERE ManagerID=? AND ContractorID=?', m.Mgr, c.ContractorID);
  if (!lc || lc.Status === 'blocked') throw fail(403, 'Connect with this landlord first.');
  if (get('SELECT 1 FROM ContractorBids WHERE ProjectID=? AND ContractorID=?', m.ProjectID, c.ContractorID)) throw fail(409, 'You already bid on this job.');
  const items = (Array.isArray(b.lineItems) ? b.lineItems : []).map((li) => ({ desc: String(li.desc || '').slice(0, 200), qty: Number(li.qty) || 0, unit: String(li.unit || 'ea').slice(0, 10), unitPrice: Number(li.unitPrice) || 0 }));
  const total = r2(items.reduce((s, li) => s + li.qty * li.unitPrice, 0));
  if (total <= 0 || items.some((li) => !li.desc.trim())) throw fail(400, 'Add at least one line item with a description and price.');
  return db.transaction(() => {
    const id = run('INSERT INTO ContractorBids (ProjectID,ContractorID,Amount,Description,SubmittedDate,Status) VALUES (?,?,?,?,?,?)', m.ProjectID, c.ContractorID, total, b.note || null, now(), 'Pending').lastInsertRowid;
    run('INSERT INTO BidDetails (BidID,EstimatedDays,Warranty,LineItems) VALUES (?,?,?,?)', id, b.estimatedDays || null, b.warranty || null, JSON.stringify(items));
    run(`UPDATE MaintenanceRequests SET Status='Bidding' WHERE RequestID=?`, rid);
    run(`UPDATE MaintenanceProjects SET Status='Bidding' WHERE ProjectID=?`, m.ProjectID);
    notify(m.Mgr, 'New bid received', `A contractor bid $${total} on: ${m.Description.slice(0, 80)}`, 'Bid', rid, 'MaintenanceRequest');
    return { id: `bid-${id}` };
  })();
}));

const bidFor = (uid, params) => {
  const bid = get(`SELECT b.*, pr.RequestID, pr.ProjectID AS PID, m.Description AS Issue FROM ContractorBids b JOIN MaintenanceProjects pr ON pr.ProjectID=b.ProjectID JOIN MaintenanceRequests m ON m.RequestID=pr.RequestID
    WHERE b.BidID=? AND pr.PropertyManagerID=?`, rawId(params.bidId), uid);
  if (!bid || rawId(params.id) !== bid.RequestID) throw fail(404, 'Bid not found.');
  if (bid.Status !== 'Pending') throw fail(409, 'This bid is no longer pending.');
  return bid;
};
const notifyContractor = (contractorId, title, msg, type, rid) => { for (const e of all('SELECT UserID FROM ContractorEmployees WHERE ContractorID=?', contractorId)) notify(e.UserID, title, msg, type, rid, 'MaintenanceRequest'); };

app.post('/api/requests/:id/bids/:bidId/accept', auth('landlord'), h(({ user, params }) => {
  const bid = bidFor(user.id, params);
  db.transaction(() => {
    for (const o of all(`SELECT BidID, ContractorID, Amount FROM ContractorBids WHERE ProjectID=? AND BidID<>? AND Status='Pending'`, bid.PID, bid.BidID)) {
      run(`UPDATE ContractorBids SET Status='Declined' WHERE BidID=?`, o.BidID);
      notifyContractor(o.ContractorID, 'Bid not selected', `Your bid of $${o.Amount} for "${bid.Issue}" was not selected this time.`, 'declined', bid.RequestID);
    }
    run(`UPDATE ContractorBids SET Status='Accepted' WHERE BidID=?`, bid.BidID);
    run(`UPDATE MaintenanceRequests SET Status='In Progress' WHERE RequestID=?`, bid.RequestID);
    run(`UPDATE MaintenanceProjects SET Status='In Progress', StartDate=? WHERE ProjectID=?`, now(), bid.PID);
    run('INSERT INTO WorkOrders (ProjectID,ContractorID,BidID,Description,Status,ScheduledDate) VALUES (?,?,?,?,?,?)', bid.PID, bid.ContractorID, bid.BidID, bid.Issue, 'In Progress', now());
    notifyContractor(bid.ContractorID, 'Bid accepted', `Your bid of $${bid.Amount} for "${bid.Issue}" was accepted. Please begin work as scheduled.`, 'accepted', bid.RequestID);
    const t = get('SELECT t.UserID FROM MaintenanceRequests m JOIN Tenants t ON t.TenantID=m.TenantID WHERE m.RequestID=?', bid.RequestID);
    if (t) notify(t.UserID, 'Repair scheduled', `A contractor has been assigned to: ${bid.Issue.slice(0, 80)}`, 'Request', bid.RequestID, 'MaintenanceRequest');
  })();
}));
app.post('/api/requests/:id/bids/:bidId/decline', auth('landlord'), h(({ user, params }) => {
  const bid = bidFor(user.id, params);
  db.transaction(() => {
    run(`UPDATE ContractorBids SET Status='Declined' WHERE BidID=?`, bid.BidID);
    if (!get(`SELECT 1 FROM ContractorBids WHERE ProjectID=? AND Status='Pending'`, bid.PID)) {
      run(`UPDATE MaintenanceRequests SET Status='Open' WHERE RequestID=?`, bid.RequestID);
      run(`UPDATE MaintenanceProjects SET Status='Open' WHERE ProjectID=?`, bid.PID);
    }
    notifyContractor(bid.ContractorID, 'Bid not selected', `Your bid of $${bid.Amount} for "${bid.Issue}" was not selected. Keep an eye out for new jobs.`, 'declined', bid.RequestID);
  })();
}));

/* ---------- contractor: active job ---------- */
const myWorkOrder = (uid, id) => {
  const c = contractorOf(uid), w = get('SELECT * FROM WorkOrders WHERE WorkOrderID=? AND ContractorID=?', id, c.ContractorID);
  if (!w) throw fail(404, 'Work order not found.');
  return { c, w };
};
app.put('/api/work-orders/:id/details', auth('contractor'), h(({ user, params, body: b }) => {
  const { w } = myWorkOrder(user.id, params.id);
  const cur = get('SELECT * FROM JobDetails WHERE WorkOrderID=?', w.WorkOrderID) || { CompletionNotes: '', PaymentMethod: null, Paid: 0 };
  const notes = b.completionNotes !== undefined ? String(b.completionNotes).slice(0, 4000) : cur.CompletionNotes;
  const method = b.paymentMethod !== undefined ? (['cash', 'card'].includes(b.paymentMethod) ? b.paymentMethod : null) : cur.PaymentMethod;
  const paid = b.paid !== undefined ? (b.paid ? 1 : 0) : cur.Paid;
  db.transaction(() => {
    run('INSERT OR REPLACE INTO JobDetails (WorkOrderID,CompletionNotes,PaymentMethod,Paid) VALUES (?,?,?,?)', w.WorkOrderID, notes, method, paid);
    if (b.paid !== undefined) {  // paying out closes the job; un-marking reopens it
      const pr = get('SELECT RequestID FROM MaintenanceProjects WHERE ProjectID=?', w.ProjectID);
      run('UPDATE WorkOrders SET Status=?, CompletionDate=? WHERE WorkOrderID=?', paid ? 'Completed' : 'In Progress', paid ? now() : null, w.WorkOrderID);
      run('UPDATE MaintenanceProjects SET Status=?, CompletionDate=? WHERE ProjectID=?', paid ? 'Completed' : 'In Progress', paid ? now() : null, w.ProjectID);
      run('UPDATE MaintenanceRequests SET Status=? WHERE RequestID=?', paid ? 'Resolved' : 'In Progress', pr.RequestID);
      run(`UPDATE Invoices SET Status=? WHERE WorkOrderID=?`, paid ? 'Paid' : 'Issued', w.WorkOrderID);
      if (paid) {
        const t = get('SELECT t.UserID FROM MaintenanceRequests m JOIN Tenants t ON t.TenantID=m.TenantID WHERE m.RequestID=?', pr.RequestID);
        if (t) notify(t.UserID, 'Request resolved', 'Your maintenance request has been completed.', 'Request', pr.RequestID, 'MaintenanceRequest');
        notify(get('SELECT PropertyManagerID AS m FROM MaintenanceProjects WHERE ProjectID=?', w.ProjectID).m, 'Work completed', `Work order #${w.WorkOrderID} was completed and paid.`, 'WorkOrder', w.WorkOrderID, 'WorkOrder');
      }
    }
  })();
}));
app.post('/api/work-orders/:id/invoice', auth('contractor'), h(({ user, params, body: b }) => {
  const { c, w } = myWorkOrder(user.id, params.id);
  const num_ = `INV-${String(w.WorkOrderID).padStart(5, '0')}`, amount = num(b.amount, 'amount');
  const ex = get('SELECT InvoiceID FROM Invoices WHERE WorkOrderID=?', w.WorkOrderID);
  if (ex) run('UPDATE Invoices SET Amount=? WHERE InvoiceID=?', amount, ex.InvoiceID);
  else run(`INSERT INTO Invoices (WorkOrderID,ContractorID,InvoiceNumber,InvoiceDate,Amount,Status) VALUES (?,?,?,?,?,?)`, w.WorkOrderID, c.ContractorID, num_, today(), amount, get('SELECT Paid FROM JobDetails WHERE WorkOrderID=?', w.WorkOrderID)?.Paid ? 'Paid' : 'Issued');
  return { invoiceNumber: num_ };
}));

/* ---------- file storage ---------- */
const MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
const saveFile = (dataUrl, dir, imagesOnly) => {
  const m = /^data:([\w.+/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m || !MIME[m[1]] || (imagesOnly && !m[1].startsWith('image/'))) throw fail(400, 'Unsupported file type.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1048576) throw fail(400, 'File is too large (10 MB max).');
  const name = `${crypto.randomUUID()}.${MIME[m[1]]}`;
  fs.writeFileSync(UPLOADS + dir + '/' + name, buf);
  return { name, size: buf.length };
};

app.post('/api/work-orders/:id/photos', auth('contractor'), h(({ user, params, body: b }) => {
  const { c, w } = myWorkOrder(user.id, params.id);
  if (!['before', 'after'].includes(b.phase)) throw fail(400, 'Invalid photo type.');
  if (get('SELECT COUNT(*) AS n FROM WorkPhotos WHERE WorkOrderID=? AND PhotoType=?', w.WorkOrderID, b.phase).n >= 6) throw fail(400, 'Up to 6 photos per section.');
  const f = saveFile(b.dataUrl, 'photos', true), url = `/uploads/photos/${f.name}`;
  const id = run('INSERT INTO WorkPhotos (WorkOrderID,EmployeeID,PhotoURL,PhotoType,Timestamp) VALUES (?,?,?,?,?)', w.WorkOrderID, c.EmployeeID, url, b.phase, now()).lastInsertRowid;
  return { id, url };
}));
app.delete('/api/work-orders/:id/photos/:photoId', auth('contractor'), h(({ user, params }) => {
  const { w } = myWorkOrder(user.id, params.id);
  const p = get('SELECT * FROM WorkPhotos WHERE PhotoID=? AND WorkOrderID=?', params.photoId, w.WorkOrderID);
  if (!p) throw fail(404, 'Photo not found.');
  run('DELETE FROM WorkPhotos WHERE PhotoID=?', p.PhotoID);
  fs.rmSync(UPLOADS + 'photos/' + p.PhotoURL.split('/').pop(), { force: true });
}));

/* ---------- documents ---------- */
const docOut = (d) => ({ id: d.DocumentID, name: d.Name, type: d.DocType, date: fmtStamp(d.UploadedDate), size: fmtSize(d.SizeBytes) });
const DOC_TYPES = ['Lease', 'Inspection', 'Notice', 'Receipt', 'Addendum', 'Renewal'];
const canSeeLease = (user, leaseId) => user.role === 'landlord' ? mine(user.id, leaseId)
  : get('SELECT 1 FROM LeaseTenants lt JOIN Tenants t ON t.TenantID=lt.TenantID WHERE lt.LeaseID=? AND t.UserID=?', leaseId, user.id);

app.get('/api/documents', auth('tenant'), h(({ user }) => all(
  `SELECT d.* FROM Documents d JOIN Leases l ON l.LeaseID=d.LeaseID JOIN LeaseTenants lt ON lt.LeaseID=l.LeaseID WHERE lt.TenantID=? AND l.Status='Active' ORDER BY d.UploadedDate DESC`, tenantId(user.id)).map(docOut)));

app.get('/api/documents/archive', auth('landlord'), h(({ user }) => all(
  `SELECT l.LeaseID, l.StartDate, l.EndDate, l.Status, u.UnitNumber, p.Address,
     (SELECT GROUP_CONCAT(us.FullName, ', ') FROM LeaseTenants lt JOIN Tenants t ON t.TenantID=lt.TenantID JOIN Users us ON us.UserID=t.UserID WHERE lt.LeaseID=l.LeaseID) AS Tenant
   FROM Leases l JOIN Units u ON u.UnitID=l.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID
   WHERE p.PropertyManagerID=? ORDER BY l.StartDate DESC`, user.id).map((l) => {
  const mo = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { leaseId: l.LeaseID, tenantName: l.Tenant || 'Unknown', unit: l.UnitNumber, address: l.Address, current: l.Status === 'Active',
    period: `${mo(l.StartDate)} – ${l.Status === 'Active' ? 'Present' : mo(l.EndDate)}`, docs: all('SELECT * FROM Documents WHERE LeaseID=? ORDER BY UploadedDate DESC', l.LeaseID).map(docOut) };
})));

app.post('/api/documents', auth('landlord', 'tenant'), h(({ user, body: b }) => {
  need(b, 'name', 'dataUrl');
  const type = DOC_TYPES.includes(b.type) ? b.type : 'Notice';
  let leaseId = Number(b.leaseId);
  if (user.role === 'tenant') leaseId = get(`SELECT l.LeaseID FROM Leases l JOIN LeaseTenants lt ON lt.LeaseID=l.LeaseID WHERE lt.TenantID=? AND l.Status='Active'`, tenantId(user.id))?.LeaseID;
  if (!leaseId || !canSeeLease(user, leaseId)) throw fail(404, 'Lease not found.');
  const f = saveFile(b.dataUrl, 'docs', false);
  const id = run('INSERT INTO Documents (LeaseID,UploadedByUserID,Name,DocType,FilePath,SizeBytes,UploadedDate) VALUES (?,?,?,?,?,?,?)', leaseId, user.id, String(b.name).slice(0, 200), type, f.name, f.size, now()).lastInsertRowid;
  return docOut(get('SELECT * FROM Documents WHERE DocumentID=?', id));
}));

app.get('/api/documents/:id/download', auth('landlord', 'tenant'), (req, res) => {
  const d = get('SELECT * FROM Documents WHERE DocumentID=?', req.params.id);
  if (!d || !canSeeLease(req.user, d.LeaseID)) return res.status(404).json({ error: 'Document not found.' });
  res.download(UPLOADS + 'docs/' + d.FilePath, d.Name + '.' + d.FilePath.split('.').pop());
});

/* ---------- tenant home ---------- */
app.get('/api/tenant/home', auth('tenant'), h(({ user }) => {
  const tid = tenantId(user.id);
  const l = get(`SELECT l.*, u.UnitNumber, p.Address FROM Leases l JOIN LeaseTenants lt ON lt.LeaseID=l.LeaseID JOIN Units u ON u.UnitID=l.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID
    WHERE lt.TenantID=? AND l.Status='Active' ORDER BY l.StartDate DESC`, tid);
  const notices = all(`SELECT NotificationID, Title, Message, CreatedDate, ReadDate FROM Notifications WHERE UserID=? AND Type='Reminder' ORDER BY CreatedDate DESC LIMIT 5`, user.id)
    .map((n) => ({ id: n.NotificationID, title: n.Title, message: n.Message, date: fmtDay(n.CreatedDate), read: !!n.ReadDate }));
  if (!l) return { lease: null, payments: [], notices };
  const s = rentStatus(l.LeaseID), t = today();
  const payments = all(`SELECT ph.PaymentID, ph.PaymentDate, ph.AmountPaid, ph.PaymentMethod, r.DueDate FROM PaymentHistory ph JOIN RentSchedule r ON r.RentScheduleID=ph.RentScheduleID WHERE r.LeaseID=? ORDER BY ph.PaymentDate DESC, ph.PaymentID DESC`, l.LeaseID)
    .map((p) => ({ month: fmtMonth(p.DueDate), date: fmtDay(p.PaymentDate), amount: p.AmountPaid, status: Date.parse(p.PaymentDate) - Date.parse(p.DueDate) > 3 * 864e5 ? 'Late' : 'Paid', method: p.PaymentMethod || 'Online', ref: `TXN-${p.PaymentID}` }));
  const due = s.rows.find((r) => r.Paid + 0.004 < r.AmountDue);  // oldest unpaid charge
  return { lease: { unit: l.UnitNumber, address: l.Address, rent: l.MonthlyRent, endDate: fmtDay(l.EndDate), endMonth: new Date(l.EndDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) },
    nextRent: due ? { amount: r2(due.AmountDue - due.Paid), date: fmtDay(due.DueDate), month: new Date(due.DueDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }), daysUntil: Math.round((Date.parse(due.DueDate) - Date.parse(t)) / 864e5) } : null,
    balance: s.balance, payments, notices };
}));
app.post('/api/tenant/pay', auth('tenant'), h(({ user }) => {
  const l = get(`SELECT l.LeaseID FROM Leases l JOIN LeaseTenants lt ON lt.LeaseID=l.LeaseID WHERE lt.TenantID=? AND l.Status='Active'`, tenantId(user.id));
  if (!l) throw fail(400, 'No active lease.');
  const s = rentStatus(l.LeaseID), due = s.rows.filter((r) => r.Paid + 0.004 < r.AmountDue);
  if (!due.length) throw fail(400, 'Nothing is due right now.');
  // pays everything overdue, or the next upcoming charge if nothing is overdue. NOTE: records the payment; no card processor is connected yet.
  const amount = s.balance > 0 ? s.balance : r2(due[0].AmountDue - due[0].Paid);
  applyPayment(l.LeaseID, amount, 'Online');
  const mgr = get('SELECT p.PropertyManagerID AS m FROM Leases l JOIN Units u ON u.UnitID=l.UnitID JOIN Properties p ON p.PropertyID=u.PropertyID WHERE l.LeaseID=?', l.LeaseID).m;
  notify(mgr, 'Rent payment received', `$${amount} was paid by ${get('SELECT FullName FROM Users WHERE UserID=?', user.id).FullName}.`, 'Payment', l.LeaseID, 'Lease');
  return { amount };
}));

/* ---------- notifications ---------- */
app.get('/api/notifications', auth(), h(({ user }) => all('SELECT NotificationID, Title, Message, Type, CreatedDate, ReadDate, RelatedEntityID FROM Notifications WHERE UserID=? ORDER BY CreatedDate DESC LIMIT 100', user.id)
  .map((n) => ({ id: n.NotificationID, contractorId: user.id, requestId: n.RelatedEntityID ? RID(n.RelatedEntityID) : null, message: n.Message, title: n.Title, type: n.Type, read: !!n.ReadDate }))));
app.post('/api/notifications/read', auth(), h(({ user }) => { run('UPDATE Notifications SET ReadDate=? WHERE UserID=? AND ReadDate IS NULL', now(), user.id); }));

/* ---------- serve the built site in production ---------- */
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.sendFile(dist + 'index.html'));
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PROPFLOW API on http://localhost:${PORT}`));
