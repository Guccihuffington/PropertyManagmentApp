// End-to-end API check. Start the server with a throwaway DB, then run: node smoke.mjs
//   DB_FILE=/tmp/t.db node server.js &   DB_FILE=/tmp/t.db node smoke.mjs
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
const B = process.env.API || 'http://localhost:3001/api';
const raw = new DatabaseSync(process.env.DB_FILE || fileURLToPath(new URL('./propflow.db', import.meta.url)));
const call = async (tok, method, path, body) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(tok && { Authorization: 'Bearer ' + tok }) }, body: body && JSON.stringify(body) });
  const ct = r.headers.get('content-type') || ''; return { s: r.status, j: ct.includes('json') ? await r.json() : await r.text() };
};
let pass = 0, bad = 0;
const ok = (name, cond, extra) => { cond ? pass++ : bad++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(extra).slice(0, 300))); };
const tag = Date.now(), em = (n) => `${n}${tag}@x.com`;
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 hello').toString('base64');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const signup = async (role, name, extra = {}) => {
  let verifyCode; if (role === 'tenant') { const c = await call(null, 'POST', '/auth/send-code', { email: em(name), purpose: 'verify' }); verifyCode = c.j.devCode; }
  return call(null, 'POST', '/auth/register', { name: name + ' User', email: em(name), password: 'secret1', role, phone: '555', verifyCode, ...extra });
};

/* auth + verification */
ok('tenant needs correct code', (await call(null, 'POST', '/auth/register', { name: 'Z', email: em('z'), password: 'secret1', role: 'tenant', phone: '1', verifyCode: '000000' })).s === 400);
const L = (await signup('landlord', 'lana')).j, T0 = (await signup('tenant', 'tia')).j, C1 = (await signup('contractor', 'carl', { company: 'Carl Co' })).j, C2 = (await signup('contractor', 'cleo', { company: 'Cleo Co' })).j;
ok('4 signups', L.token && T0.token && C1.token && C2.token);
ok('contractor company on account', C1.user.company === 'Carl Co');
ok('dup email', (await call(null, 'POST', '/auth/send-code', { email: em('lana'), purpose: 'verify' })).s === 409);
ok('bad login', (await call(null, 'POST', '/auth/login', { email: em('lana'), password: 'no' })).s === 401);
ok('role guard', (await call(T0.token, 'GET', '/portfolio')).s === 403);
ok('no token', (await call(null, 'GET', '/requests')).s === 401);

/* landlord portfolio */
const bld = (await call(L.token, 'POST', '/buildings', { address: '821 Maple Street', units: 3 })).j;
let pf = (await call(L.token, 'GET', '/portfolio')).j;
ok('building + 3 vacant units', pf.properties[0].units === 3 && pf.properties[0].vacant.length === 3 && pf.properties[0].vacant[0].label === 'Unit A', pf);
ok('landlord code is 8 digits', /^\d{8}$/.test(pf.code));
const [vA, vB, vC] = pf.properties[0].vacant;

/* placeholder tenant + invite claim */
ok('add tenant by name', (await call(L.token, 'POST', '/tenants', { unitId: vA.unitId, name: 'Jamie Rivera', rent: 2150 })).j.leaseId);
ok('unit with tenant rejects second', (await call(L.token, 'POST', '/tenants', { unitId: vA.unitId, name: 'X', rent: 1 })).s === 409);
pf = (await call(L.token, 'GET', '/portfolio')).j; let ten = pf.properties[0].tenants[0];
ok('tenant listed, pending (not paid, 0 overdue)', ten.name === 'Jamie Rivera' && ten.rent === 2150 && !ten.paid && ten.overdueMonths === 0, ten);
const inv = (await call(L.token, 'POST', `/units/${vA.unitId}/invite`)).j.code;
ok('invite is 8 digits + stable', /^\d{8}$/.test(inv) && (await call(L.token, 'POST', `/units/${vA.unitId}/invite`)).j.code === inv);
ok('invite resolves publicly', (await call(null, 'GET', `/invites/${inv}`)).j.unit === 'Unit A');
ok('bad invite code rejected at signup', (await signup('tenant', 'bad', { inviteCode: '12345678' })).s === 400);
const T = (await signup('tenant', 'jamie', { inviteCode: inv })).j;
pf = (await call(L.token, 'GET', '/portfolio')).j;
ok('signup claimed placeholder (1 tenant, real name)', pf.properties[0].tenants.length === 1 && pf.properties[0].tenants[0].name === 'jamie User', pf.properties[0].tenants);
ok('placeholder user removed', raw.prepare(`SELECT COUNT(*) n FROM Users WHERE Email LIKE '%@placeholder.invalid'`).get().n === 0);
const leaseId = pf.properties[0].tenants[0].leaseId;

/* tenant home + rent ledger */
let home = (await call(T.token, 'GET', '/tenant/home')).j;
ok('tenant home', home.lease.unit === 'Unit A' && home.lease.address === '821 Maple Street' && home.nextRent.amount === 2150 && home.balance === 0, home);
raw.prepare(`INSERT INTO RentSchedule (LeaseID,DueDate,AmountDue) VALUES (?,?,?)`).run(leaseId, '2026-01-01', 2150);  // simulate an old unpaid month
pf = (await call(L.token, 'GET', '/portfolio')).j; ten = pf.properties[0].tenants[0];
ok('overdue detected', !ten.paid && ten.overdueMonths === 1, ten);
let hist = (await call(L.token, 'GET', `/leases/${leaseId}/payments`)).j;
ok('landlord history shows Overdue', hist[0].status === 'Overdue' && hist[0].month === 'Jan 2026' && hist[0].overdueDays > 30, hist);
ok('tenant balance = overdue', (await call(T.token, 'GET', '/tenant/home')).j.balance === 2150);
ok('tenant pays overdue', (await call(T.token, 'POST', '/tenant/pay')).j.amount === 2150);
home = (await call(T.token, 'GET', '/tenant/home')).j;
ok('balance clear + payment recorded as Late', home.balance === 0 && home.payments[0].status === 'Late' && home.payments[0].ref.startsWith('TXN-'), home.payments);
ok('landlord now sees paid', (await call(L.token, 'GET', '/portfolio')).j.properties[0].tenants[0].paid === true);
ok('nothing-due case or next rent pays', (await call(T.token, 'POST', '/tenant/pay')).j.amount === 2150);
ok('reminder', (await call(L.token, 'POST', '/reminders', { leaseId, channel: 'email', message: 'Rent is late' })).j.ok);
ok('tenant sees notice', (await call(T.token, 'GET', '/tenant/home')).j.notices[0].message === 'Rent is late');

/* contractor connections + request/bid flow */
const rq = (await call(T.token, 'POST', '/requests', { description: 'Dishwasher not draining', priority: 'High', room: 'Kitchen', type: 'Appliance' })).j.id;
ok('request created', /^MR-\d+$/.test(rq));
ok('landlord notified', (await call(L.token, 'GET', '/notifications')).j.some((n) => n.title === 'New maintenance request'));
ok('unconnected contractor sees no jobs', (await call(C1.token, 'GET', '/requests')).j.length === 0);
ok('bad landlord code', (await call(C1.token, 'POST', '/contractor/connect', { code: '00000000' })).s === 404);
const lines = [{ desc: 'Labor', qty: 2, unit: 'hr', unitPrice: 85 }, { desc: 'Pump', qty: 1, unit: 'ea', unitPrice: 40 }];
ok('bid blocked before connecting', (await call(C1.token, 'POST', `/requests/${rq}/bids`, { lineItems: lines })).s === 403);
ok('connect c1', (await call(C1.token, 'POST', '/contractor/connect', { code: pf.code })).j.ok);
ok('connect twice rejected', (await call(C1.token, 'POST', '/contractor/connect', { code: pf.code })).s === 409);
ok('connect c2', (await call(C2.token, 'POST', '/contractor/connect', { code: pf.code })).j.ok);
ok('contractor landlords list has property', (await call(C1.token, 'GET', '/contractor/landlords')).j[0].properties[0] === '821 Maple Street');
ok('c1 sees open job', (await call(C1.token, 'GET', '/requests')).j.length === 1);
ok('bid needs line items', (await call(C1.token, 'POST', `/requests/${rq}/bids`, { lineItems: [] })).s === 400);
const b1 = (await call(C1.token, 'POST', `/requests/${rq}/bids`, { lineItems: lines, note: 'quick', estimatedDays: '1', warranty: '30 days' })).j.id;
ok('c1 bid; total computed server-side = 210', b1 && (await call(C1.token, 'GET', '/requests')).j[0].bids[0].price === 210);
ok('dup bid', (await call(C1.token, 'POST', `/requests/${rq}/bids`, { lineItems: lines })).s === 409);
ok('c2 still sees job after c1 bid (status Bidding)', (await call(C2.token, 'GET', '/requests')).j.length === 1);
const b2 = (await call(C2.token, 'POST', `/requests/${rq}/bids`, { lineItems: [{ desc: 'All in', qty: 1, unit: 'ea', unitPrice: 300 }] })).j.id;
let lr = (await call(L.token, 'GET', '/requests')).j[0];
ok('landlord sees both bids + status Bidding', lr.bids.length === 2 && lr.status === 'Bidding' && lr.bids[0].lineItems.length === 2, lr);
ok('contractor only sees own bid', (await call(C2.token, 'GET', '/requests')).j[0].bids.length === 1);
ok('contractor cannot accept', (await call(C1.token, 'POST', `/requests/${rq}/bids/${b1}/accept`)).s === 403);
ok('block c2 (landlord)', (await call(L.token, 'POST', `/landlord/contractors/${C2.user.id}`, { status: 'blocked' })).j.ok);
ok('portfolio reports blocked', (await call(L.token, 'GET', '/portfolio')).j.blocked.includes(C2.user.id));
ok('decline c2 -> request stays Bidding (c1 pending)', (await call(L.token, 'POST', `/requests/${rq}/bids/${b2}/decline`)).j.ok && (await call(L.token, 'GET', '/requests')).j[0].status === 'Bidding');
ok('c2 notified of decline', (await call(C2.token, 'GET', '/notifications')).j.some((n) => n.type === 'declined'));
ok('accept c1', (await call(L.token, 'POST', `/requests/${rq}/bids/${b1}/accept`)).j.ok);
lr = (await call(L.token, 'GET', '/requests')).j[0];
ok('request In Progress, acceptedBidId set', lr.status === 'In Progress' && lr.acceptedBidId === b1, lr);
ok('c1 notified accepted', (await call(C1.token, 'GET', '/notifications')).j.some((n) => n.type === 'accepted' && n.message.includes('accepted')));
ok('tenant sees In Progress', (await call(T.token, 'GET', '/requests')).j[0].status === 'In Progress');
ok('second accept rejected', (await call(L.token, 'POST', `/requests/${rq}/bids/${b1}/accept`)).s === 409);

/* active job: notes, photos, invoice, paid */
let job = (await call(C1.token, 'GET', '/requests')).j[0].job; const wo = job.workOrderId;
ok('job block present', wo && job.paid === false);
ok('save notes + method', (await call(C1.token, 'PUT', `/work-orders/${wo}/details`, { completionNotes: 'Cleared pump', paymentMethod: 'cash' })).j.ok);
const ph = (await call(C1.token, 'POST', `/work-orders/${wo}/photos`, { phase: 'before', dataUrl: png })).j;
ok('photo upload', ph.id && ph.url.startsWith('/uploads/photos/'));
ok('photo is served', (await fetch(B.replace('/api', '') + ph.url)).status === 200);
ok('reject non-image photo', (await call(C1.token, 'POST', `/work-orders/${wo}/photos`, { phase: 'after', dataUrl: pdf })).s === 400);
job = (await call(C1.token, 'GET', '/requests')).j[0].job;
ok('job persisted', job.completionNotes === 'Cleared pump' && job.paymentMethod === 'cash' && job.photos.before.length === 1, job);
ok('other contractor cannot touch job', (await call(C2.token, 'PUT', `/work-orders/${wo}/details`, { paid: true })).s === 404);
ok('invoice number', (await call(C1.token, 'POST', `/work-orders/${wo}/invoice`, { amount: 210 })).j.invoiceNumber === `INV-${String(wo).padStart(5, '0')}`);
ok('mark paid resolves request', (await call(C1.token, 'PUT', `/work-orders/${wo}/details`, { paid: true })).j.ok && (await call(L.token, 'GET', '/requests')).j[0].status === 'Resolved');
ok('unmark paid reopens', (await call(C1.token, 'PUT', `/work-orders/${wo}/details`, { paid: false })).j.ok && (await call(L.token, 'GET', '/requests')).j[0].status === 'In Progress');
ok('delete photo', (await call(C1.token, 'DELETE', `/work-orders/${wo}/photos/${ph.id}`)).j.ok);
ok('mark all read', (await call(C1.token, 'POST', '/notifications/read')).j.ok && (await call(C1.token, 'GET', '/notifications')).j.every((n) => n.read));

/* documents */
const d1 = (await call(L.token, 'POST', '/documents', { leaseId, name: 'Lease Agreement', type: 'Lease', dataUrl: pdf })).j;
ok('landlord upload', d1.id && d1.type === 'Lease' && d1.size.endsWith('KB'), d1);
ok('bad type rejected', (await call(L.token, 'POST', '/documents', { leaseId, name: 'x', type: 'Lease', dataUrl: 'data:text/html;base64,PGI+' })).s === 400);
const d2 = (await call(T.token, 'POST', '/documents', { name: 'My renter insurance', type: 'Addendum', dataUrl: pdf })).j;
ok('tenant upload to own lease', d2.id);
ok('tenant lists both', (await call(T.token, 'GET', '/documents')).j.length === 2);
const dl = await fetch(`${B}/documents/${d1.id}/download`, { headers: { Authorization: 'Bearer ' + T.token } });
ok('tenant downloads file', dl.status === 200 && (await dl.text()).startsWith('%PDF'));
ok('outsider cannot download', (await fetch(`${B}/documents/${d1.id}/download`, { headers: { Authorization: 'Bearer ' + (await signup('tenant', 'nosy')).j.token } })).status === 404);
const arch = (await call(L.token, 'GET', '/documents/archive')).j;
ok('landlord archive record', arch[0].tenantName === 'jamie User' && arch[0].current && arch[0].docs.length === 2 && arch[0].period.endsWith('Present'), arch);

/* vacate, remove building, reset password */
ok('vacate', (await call(L.token, 'POST', `/leases/${leaseId}/vacate`)).j.ok);
pf = (await call(L.token, 'GET', '/portfolio')).j;
ok('unit vacant again, invite kept', pf.properties[0].tenants.length === 0 && pf.properties[0].vacant.find((v) => v.label === 'Unit A').inviteCode === inv);
const arch2 = (await call(L.token, 'GET', '/documents/archive')).j;
ok('past tenancy + docs kept', arch2[0].current === false && arch2[0].docs.length === 2);
ok('tenant has no active docs after move-out', (await call(T.token, 'GET', '/documents')).j.length === 0);
ok('remove building', (await call(L.token, 'DELETE', `/buildings/${bld.id}`)).j.ok && (await call(L.token, 'GET', '/portfolio')).j.properties.length === 0);
const rc = (await call(null, 'POST', '/auth/send-code', { email: em('lana'), purpose: 'reset' })).j.devCode;
ok('reset code issued', /^\d{6}$/.test(rc));
ok('reset wrong code', (await call(null, 'POST', '/auth/reset', { email: em('lana'), code: '111111', password: 'newpass1' })).s === 400);
ok('reset ok', (await call(null, 'POST', '/auth/reset', { email: em('lana'), code: rc, password: 'newpass1' })).j.ok);
ok('login with new password', (await call(null, 'POST', '/auth/login', { email: em('lana'), password: 'newpass1' })).j.token);
ok('reset unknown email gives no code', (await call(null, 'POST', '/auth/send-code', { email: 'nobody@x.com', purpose: 'reset' })).j.devCode === undefined);
console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
