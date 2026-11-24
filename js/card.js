import { h, badge, fmtDate, fmtTime, toast } from './ui.js';
import { qrSvg, qrPayload, qrMatrix, groupCode } from './qr.js';

export const STATUS_WORD = { active: 'ACTIVE', expired: 'EXPIRED', suspended: 'SUSPENDED', cancelled: 'CANCELLED', pending: 'NOT ACTIVE YET' };
export const STATUS_COLOR = { active: 'green', expired: 'orange', suspended: 'gray', cancelled: 'gray', pending: 'gray' };

export function statusBadge(status) { return badge(STATUS_WORD[status] || String(status).toUpperCase(), STATUS_COLOR[status] || 'gray'); }

// The big verification result. GREEN available, RED already redeemed, ORANGE expired, GRAY inactive/suspended.
// Always icon + words + colour + border style, never colour alone.
export function stateBanner(m) {
  const t = m.today || {};
  const pct = m.discount_pct;
  let cls, icon, big, sub;
  if (m.status === 'active' && t.state === 'available') {
    cls = 'st-available'; icon = '✔'; big = `ACTIVE / AVAILABLE. TODAY'S ${pct}% DISCOUNT IS AVAILABLE`;
    sub = `Membership is valid until ${fmtDate(m.period && m.period.end)}. ${pct}% off ONE eligible item today.`;
  } else if (m.status === 'active' && t.state === 'redeemed') {
    cls = 'st-redeemed'; icon = '●'; big = 'ALREADY REDEEMED';
    sub = `Membership is valid, but today's discount was used at ${t.branch || 'a branch'} at ${fmtTime(t.redeemed_at)}${t.item ? ' (' + t.item + ')' : ''}.`;
  } else if (m.status === 'active' && t.state === 'held') {
    cls = 'st-held'; icon = '⏳'; big = 'DISCOUNT IN CHECKOUT';
    sub = `A checkout is in progress${t.held_branch ? ' at ' + t.held_branch : ''}${t.held_item ? ' for ' + t.held_item : ''}. It is not redeemed until that sale is completed (hold ends ${fmtTime(t.held_until)}).`;
  } else if (m.status === 'expired') {
    cls = 'st-expired'; icon = '✖'; big = 'EXPIRED';
    sub = `Membership ended ${fmtDate(m.period && m.period.end)}. Today's benefit: NOT AVAILABLE. Renew to use the discount.`;
  } else if (m.status === 'suspended') {
    cls = 'st-suspended'; icon = '⏸'; big = 'INACTIVE / SUSPENDED';
    sub = 'This membership is not currently eligible for redemption. Today\'s benefit: NOT AVAILABLE. Please ask a manager.';
  } else if (m.status === 'cancelled') {
    cls = 'st-cancelled'; icon = '✖'; big = 'INACTIVE / CANCELLED'; sub = 'Today\'s benefit: NOT AVAILABLE.';
  } else if (m.status === 'pending') {
    cls = 'st-pending'; icon = '◷';
    if (m.pending_payment) { big = 'INACTIVE: PAYMENT NOT VERIFIED YET'; sub = 'The membership starts only after the payment is verified by a manager. Today\'s benefit: NOT AVAILABLE.'; }
    else if (m.next_start) { big = `INACTIVE: STARTS ${fmtDate(m.next_start)}`; sub = 'Not active yet. Today\'s benefit: NOT AVAILABLE.'; }
    else { big = 'INACTIVE: NO PAID MEMBERSHIP'; sub = 'There is no verified payment on this membership. Today\'s benefit: NOT AVAILABLE.'; }
  } else {
    cls = 'st-invalid'; icon = '✖'; big = 'MEMBERSHIP NOT AVAILABLE'; sub = '';
  }
  return h('div', { class: 'state ' + cls, role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'icon', 'aria-hidden': 'true' }, icon), h('div', {}, h('div', { class: 'big' }, big), h('div', { class: 'sub' }, sub)));
}

export function notFoundBanner(revoked) {
  return h('div', { class: 'state st-invalid', role: 'status' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '✖'),
    h('div', {}, h('div', { class: 'big' }, revoked ? 'THIS CARD WAS REPLACED. INVALID QR' : 'MEMBERSHIP NOT FOUND'),
      h('div', { class: 'sub' }, revoked ? 'This QR code was replaced or revoked and no longer works. Ask the member for the current card, or search by membership ID.'
        : 'Check the code and try again, or search by membership ID, mobile number or name. Nobody needs a new membership just because a scan failed.')));
}

export function offlineBanner(msg) {
  return h('div', { class: 'state st-held', role: 'alert' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '⚠'),
    h('div', {}, h('div', { class: 'big' }, 'UNABLE TO VERIFY MEMBERSHIP'),
      h('div', { class: 'sub' }, msg || 'Internet/database connection required. Do not give the discount until this works.')));
}

// "12 / 30 days used", "8 days remaining". The daily benefit does not accumulate, and the screen says so.
export function usageLine(m) {
  return h('div', { class: 'grid grid-cols-2 gap-2 text-sm' },
    h('div', {}, h('div', { class: 'hint' }, 'Days used'), h('div', { class: 'font-extrabold text-lg' }, `${m.days_used} / ${m.days_total || 30}`)),
    h('div', {}, h('div', { class: 'hint' }, 'Remaining eligible days'), h('div', { class: 'font-extrabold text-lg' }, m.status === 'active' ? `${m.days_left} day${m.days_left === 1 ? '' : 's'}` : 'None')),
    h('div', {}, h('div', { class: 'hint' }, 'Last redemption'), h('div', { class: 'font-bold' }, m.last_redeemed ? fmtDate(m.last_redeemed) : 'Never')),
    h('div', { class: 'col-span-2 hint' }, 'The daily discount does not carry over. An unused day is lost and has no cash value.'));
}

// ---------------------------------------------------------------- membership card, front and back (85.6 x 54 mm)
export function cardFront(m) {
  return h('div', { class: 'pvc front', role: 'img', 'aria-label': `Layover Club card front for ${m.name}, ${m.member_no}` },
    h('div', { class: 'top' }, 'LAYOVER DESSERT CAFÉ'), h('div', { class: 'title' }, 'LAYOVER CLUB'), h('div', { class: 'tag' }, 'YOUR DAILY CRAVINGS, REWARDED.'),
    h('div', { class: 'big' }, `${m.discount_pct}% OFF`), h('div', { class: 'one' }, 'ONE ITEM DAILY'),
    h('div', { class: 'mem' }, h('div', { class: 'nm' }, m.name), h('div', { class: 'no' }, m.member_no)));
}

export function cardBack(m, token, rules) {
  const code = groupCode(token);
  return h('div', { class: 'pvc back', 'aria-label': `Layover Club card back for ${m.name}` },
    h('div', { class: 'bname' }, h('div', { class: 'cap' }, 'Member name'), h('div', { class: 'v' }, m.name), h('div', { class: 'cap' }, 'Membership ID'), h('div', { class: 'v id' }, m.member_no)),
    h('div', { class: 'qrbox', role: 'img', 'aria-label': `QR code for ${m.member_no}. Code ${code}` }, qrSvg(qrPayload(token, rules))),
    h('div', { class: 'scan' }, 'SCAN TO VERIFY MEMBERSHIP'),
    h('div', { class: 'one-daily' }, 'One Member. One Daily Redemption.'),
    h('div', { class: 'code' }, code));
}

export function cardPair(m, token, rules, opts = {}) {
  if (!token) {
    return h('div', { class: 'space-y-2' }, h('div', { class: 'card-pair' }, cardFront(m)),
      h('div', { class: 'state st-pending' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '◷'),
        h('div', {}, h('div', { class: 'big' }, 'CARD NOT ISSUED YET'), h('div', { class: 'sub' }, 'The QR code and card are issued after the payment is verified.'))));
  }
  const actions = opts.noActions ? null : h('div', { class: 'flex gap-2 flex-wrap no-print' },
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => window.print() }, 'Print card (85.6 × 54 mm)'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCardPng('front', m, token, rules) }, 'Download front (PNG)'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCardPng('back', m, token, rules) }, 'Download back (PNG)'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadQrPng(m, token, rules) }, 'Download QR only (PNG)'),
    navigator.share ? h('button', { class: 'btn btn-success btn-sm', type: 'button', onclick: () => shareCard(m, token, rules) }, 'Send / share card…') : null);
  // the pair itself is the print area: front and back each print on their own 85.6 x 54 mm page
  return h('div', { class: 'space-y-3' }, h('div', { class: 'card-pair print-area' }, cardFront(m), cardBack(m, token, rules)), actions);
}

// ---------------------------------------------------------------- PNG download (drawn on a canvas: 1011 x 638 px = 300 dpi at 85.6 x 54 mm)
const CW = 1011, CH = 638;
export function drawCard(side, m, token, rules) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const ctx = c.getContext('2d'), u = CW / 100;
  const rr = (x, y, w, hh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const txt = (s, x, y, size, weight, color, o = {}) => {
    ctx.font = `${weight} ${size * u}px system-ui, Arial, sans-serif`; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = o.align || 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.spacing || 0) * size * u + 'px';
    let out = s; const maxW = (o.max || 100) * u;
    while (ctx.measureText(out).width > maxW && out.length > 1) out = out.slice(0, -1);
    if (out !== s) out = out.slice(0, -1) + '…';
    ctx.fillText(out, x * u, y * u);
  };
  rr(0, 0, CW, CH, 4.2 * u); ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#0642B8'); g.addColorStop(0.55, '#0a54e0'); g.addColorStop(1, '#042f85'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.beginPath(); ctx.arc(88 * u, 4 * u, 26 * u, 0, Math.PI * 2); ctx.fill();
  if (side === 'front') {
    txt('LAYOVER DESSERT CAFÉ', 5.5, 5, 2.9, 800, '#fff', { spacing: 0.22 });
    txt('LAYOVER CLUB', 5.5, 11, 8.6, 900, '#fff', { max: 88 });
    txt('YOUR DAILY CRAVINGS, REWARDED.', 5.5, 22.5, 3.1, 600, '#cfe0ff', { spacing: 0.08 });
    txt(`${m.discount_pct}% OFF`, 5.5, 29, 13, 900, '#fff');
    txt('ONE ITEM DAILY', 5.8, 43.5, 4.2, 800, '#cfe0ff', { spacing: 0.2 });
    txt(m.name, 94.5, 51.4, 4.3, 800, '#fff', { align: 'right', max: 52 });
    txt(m.member_no, 94.5, 56.2, 3.6, 700, '#cfe0ff', { align: 'right', spacing: 0.1 });
  } else {
    txt('MEMBER NAME', 5.5, 6, 2.6, 700, '#cfe0ff', { spacing: 0.14 }); txt(m.name, 5.5, 9.4, 5, 800, '#fff', { max: 46 });
    txt('MEMBERSHIP ID', 5.5, 24, 2.6, 700, '#cfe0ff', { spacing: 0.14 }); txt(m.member_no, 5.5, 27.4, 5, 800, '#fff', { spacing: 0.08 });
    const text = qrPayload(token, rules), { n, dark } = qrMatrix(text), box = 33 * u, bx = CW - 5.5 * u - box, by = 5.5 * u;
    ctx.fillStyle = '#fff'; rr(bx, by, box, box, 2.4 * u); ctx.fill();
    const inner = box - 3.2 * u, mod = inner / (n + 4), ox = bx + 1.6 * u + 2 * mod, oy = by + 1.6 * u + 2 * mod;
    ctx.fillStyle = '#000'; for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (dark(r, q)) ctx.fillRect(ox + q * mod, oy + r * mod, Math.ceil(mod), Math.ceil(mod));
    txt('SCAN TO VERIFY MEMBERSHIP', 100 - 5.5 - 16.5, 41.5, 2.3, 800, '#fff', { align: 'center', max: 36 });
    txt('One Member. One Daily Redemption.', 5.5, 54, 3.2, 700, '#cfe0ff', { max: 52 });
    txt(groupCode(token), 100 - 5.5 - 16.5, 58.2, 2.1, 500, '#cfe0ff', { align: 'center', max: 36 });
  }
  ctx.restore();
  return c;
}

export function downloadCardPng(side, m, token, rules) {
  const c = drawCard(side, m, token, rules);
  c.toBlob((blob) => { const a = h('a', { href: URL.createObjectURL(blob), download: `${m.member_no}-card-${side}.png` }); document.body.append(a); a.click(); a.remove(); }, 'image/png');
}

// A plain QR picture (white, with the name and ID under it) for sending to a customer by Messenger, SMS or email. The QR holds only the secret code / app link.
export function qrCanvas(m, token, rules) {
  const { n, dark } = qrMatrix(qrPayload(token, rules)), mod = 14, quiet = 4, side = (n + quiet * 2) * mod, textH = 150;
  const c = document.createElement('canvas'); c.width = side; c.height = side + textH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000'; for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (dark(r, q)) ctx.fillRect((q + quiet) * mod, (r + quiet) * mod, mod, mod);
  ctx.fillStyle = '#0642B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '800 34px system-ui, Arial, sans-serif'; ctx.fillText('LAYOVER CLUB', side / 2, side + 6, side - 20);
  ctx.fillStyle = '#111'; ctx.font = '700 30px system-ui, Arial, sans-serif'; ctx.fillText(m.name, side / 2, side + 50, side - 20);
  ctx.font = '600 26px ui-monospace, Menlo, Consolas, monospace'; ctx.fillText(m.member_no, side / 2, side + 92, side - 20);
  return c;
}
const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
export async function downloadQrPng(m, token, rules) {
  const blob = await toBlob(qrCanvas(m, token, rules));
  const a = h('a', { href: URL.createObjectURL(blob), download: `${m.member_no}-qr.png` }); document.body.append(a); a.click(); a.remove();
}
// On a phone this opens the share sheet (Messenger, Viber, SMS...) with the card pictures attached. Where sharing files is not supported, it says so.
export async function shareCard(m, token, rules) {
  try {
    const files = [new File([await toBlob(drawCard('front', m, token, rules))], `${m.member_no}-card-front.png`, { type: 'image/png' }),
      new File([await toBlob(drawCard('back', m, token, rules))], `${m.member_no}-card-back.png`, { type: 'image/png' }),
      new File([await toBlob(qrCanvas(m, token, rules))], `${m.member_no}-qr.png`, { type: 'image/png' })];
    if (!navigator.canShare || !navigator.canShare({ files })) { toast('Sharing pictures is not available in this browser. Use the download buttons instead.', 'warn'); return; }
    await navigator.share({ files, title: 'Your Layover Club card', text: `Your Layover Club card (${m.member_no}). Show the QR at the counter.` });
  } catch (e) { if (e && e.name !== 'AbortError') toast('Could not share: ' + (e.message || e), 'err'); }
}

// Kept for older call sites (small card preview).
export function memberCard(m, token, rules) { return cardPair(m, token, rules); }
