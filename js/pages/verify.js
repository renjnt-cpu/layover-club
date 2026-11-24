// The counter screen: verify a member, check who they are, hold the discount on ONE item, then mark it redeemed only when the sale is completed.
import { rpc, OfflineError } from '../api.js';
import { h, toast, busy, money, fmtDate, fmtTime, CHANNEL, field } from '../ui.js';
import { stateBanner, notFoundBanner, offlineBanner, usageLine, statusBadge } from '../card.js';
import { openScanner, tokenFromScan } from '../qr.js';
import { openCard, openRenew, openReversal, takePhoto, renewMessage } from '../actions.js';
import { photoBox } from '../photo.js';

export async function render(ctx) {
  const root = h('div', { class: 'space-y-4' });
  const out = h('div', { class: 'space-y-4' });
  const holdsBox = h('div', {});
  let products = null;
  let channel = 'dine_in';
  let timerId = null;
  let viaLookup = false;   // true when the member was found by mobile number or name, which is NOT proof of identity

  const stopTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };
  const branch = () => ctx.branchId();
  const needBranch = () => { if (!branch()) { toast('Choose your branch at the top of the screen first.', 'warn'); return false; } return true; };
  const fail = (e) => { stopTimer(); out.replaceChildren(e instanceof OfflineError ? offlineBanner(e.message) : h('div', { class: 'card text-red-800 font-semibold', role: 'alert' }, e.message || String(e))); };

  // ---------- search
  const q = h('input', { class: 'input', type: 'text', autocomplete: 'off', 'aria-label': 'Membership ID, mobile number or name', placeholder: 'Scan QR, or type membership ID, mobile or name', style: 'font-size:1.1rem;min-height:3.4rem' });
  const go = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Verify');
  const scan = h('button', { class: 'btn btn-secondary btn-lg', type: 'button', onclick: () => openScanner((text) => { q.value = tokenFromScan(text); lookup(q.value); }) }, 'Scan QR');
  const form = h('form', { class: 'space-y-2', onsubmit: (e) => { e.preventDefault(); lookup(q.value); } },
    h('div', { class: 'flex gap-2 flex-wrap' }, h('div', { class: 'flex-1', style: 'min-width:14rem' }, q), go, scan));

  async function lookup(text) {
    const query = String(text || '').trim();
    if (query.length < 2) { toast('Type or scan something first.', 'warn'); return; }
    stopTimer();
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Checking…'));
    try {
      const r = await rpc('club_lookup', { p_query: query, p_branch: branch() });
      if (!r.found) { out.replaceChildren(notFoundBanner(r.revoked)); return; }
      if (r.multiple) { showMatches(r.matches); return; }
      viaLookup = !!r.by_mobile_or_name;
      showMember(r.member);
    } catch (e) { fail(e); }
  }

  function showMatches(matches) {
    out.replaceChildren(h('div', { class: 'card space-y-2' }, h('h2', { class: 'font-bold' }, 'More than one match. Tap the right person.'),
      ...matches.map((m) => h('button', { class: 'pick', type: 'button', onclick: async () => { try { viaLookup = true; showMember(await rpc('club_member_view', { p_member: m.id })); } catch (e) { fail(e); } } },
        h('span', {}, h('span', { class: 'font-bold' }, m.name), h('span', { class: 'hint block' }, m.member_no + ' · ' + m.mobile)), h('span', {}, 'Open')))));
  }

  async function reload(memberId) { try { showMember(await rpc('club_member_view', { p_member: memberId })); } catch (e) { fail(e); } }

  // ---------- member result
  function showMember(m) {
    stopTimer();
    const actions = h('div', { class: 'flex gap-2 flex-wrap' });
    const t = m.today || {};
    if (m.status === 'active' && t.state === 'available' && ctx.can('redemption.use')) actions.append(h('button', { class: 'btn btn-success btn-lg', type: 'button', onclick: () => startPick(m) }, `REDEEM ${m.discount_pct}% DISCOUNT`));
    if (m.status === 'active' && t.state === 'held' && t.held_by_me && ctx.can('redemption.use')) actions.append(h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => resumeHold(m) }, 'Resume this checkout'));
    if (t.state === 'redeemed' && ctx.can('redemption.use') && t.redemption_id) actions.append(h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openReversal(ctx, t.redemption_id, () => reload(m.id)) }, 'Order voided or refunded?'));
    if ((m.status === 'expired' || m.status === 'active' || (m.status === 'pending' && !m.pending_payment)) && ctx.can('member.renew')) actions.append(h('button', { class: m.status === 'expired' ? 'btn btn-primary btn-lg' : 'btn btn-secondary', type: 'button', onclick: async () => { try { if (await openRenew(ctx, m.id)) reload(m.id); } catch (e) { toast(e.message, 'err'); } } }, m.status === 'pending' ? 'Take the payment' : 'Renew membership'));
    if (!m.has_photo && ctx.can('member.photo')) actions.append(h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => { try { if (await takePhoto(ctx, m)) reload(m.id); } catch (e) { toast(e.message, 'err'); } } }, 'Take member photo'));
    if (ctx.can('member.card')) actions.append(h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openCard(ctx, m.id).catch((e) => toast(e.message, 'err')) }, 'View digital card'));
    if (ctx.can('member.list')) actions.append(h('a', { class: 'btn btn-secondary', href: '#/members/' + m.id }, 'Full profile'));
    out.replaceChildren(...[stateBanner(m),
      viaLookup ? h('div', { class: 'card text-sm font-bold text-amber-900 bg-amber-50 border-amber-300', role: 'note' }, 'Found by mobile number or name. A phone number or a name alone is NOT proof of identity: check the registered photo or an ID before giving the discount.') : null,
      h('div', { class: 'card space-y-3' },
        h('div', { class: 'flex gap-4 items-start flex-wrap' }, photoBox(m.photo_path),
          h('div', { class: 'min-w-0 flex-1 space-y-2' },
            h('div', { class: 'flex items-start justify-between gap-2 flex-wrap' }, h('div', {}, h('div', { class: 'text-2xl font-extrabold break-words' }, m.name), h('div', { class: 'font-mono text-lg' }, m.member_no)), statusBadge(m.status)),
            h('div', { class: 'grid grid-cols-2 gap-2 text-sm' },
              h('div', {}, h('div', { class: 'hint' }, 'Activated'), h('div', { class: 'font-bold' }, fmtDate(m.period && m.period.start))),
              h('div', {}, h('div', { class: 'hint' }, 'Expires'), h('div', { class: 'font-bold' }, fmtDate(m.period && m.period.end)))))),
        usageLine(m),
        m.expiring_soon ? h('p', { class: 'text-sm font-bold text-amber-800' }, `Expires in ${m.days_left} day${m.days_left === 1 ? '' : 's'}. Offer a renewal.`) : null,
        m.open_flags ? h('p', { class: 'text-sm font-bold text-orange-800' }, `${m.open_flags} item(s) on this membership need a manager's review.`) : null,
        actions)].filter(Boolean));
  }

  // ---------- step 1: identity, then ONE item
  async function startPick(m) {
    if (!needBranch()) return;
    try { if (!products) products = await rpc('club_products_for_pick'); } catch (e) { fail(e); return; }
    let qty = 1, search = '', cat = '', chosen = null, identity = null;
    const box = h('div', { class: 'card space-y-3' });
    const list = h('div', { class: 'space-y-2' });
    const cats = [...new Set(products.map((p) => p.category))];
    const draw = () => {
      list.replaceChildren();
      const s = search.toLowerCase();
      const shown = products.filter((p) => (!cat || p.category === cat) && (!s || (p.name + ' ' + (p.variant || '')).toLowerCase().includes(s)));
      shown.slice(0, 60).forEach((p) => list.append(h('button', { class: 'pick', type: 'button', disabled: !p.eligible, onclick: () => { chosen = p; summary(); } },
        h('span', {}, h('span', { class: 'font-bold' }, p.name), p.variant ? h('span', { class: 'hint' }, ' · ' + p.variant) : null,
          h('span', { class: 'hint block' }, p.eligible ? 'MEMBER ELIGIBLE' : 'NOT ELIGIBLE FOR MEMBERSHIP')),
        h('span', { class: 'font-bold' }, money(p.price)))));
      if (!shown.length) list.append(h('div', { class: 'empty' }, 'No item matches.'));
      if (shown.length > 60) list.append(h('p', { class: 'hint' }, 'Showing the first 60. Type more to narrow it down.'));
    };
    const qtyOut = h('span', { class: 'font-extrabold text-xl w-10 text-center', 'aria-live': 'polite' }, '1');
    const setQty = (n) => { qty = Math.max(1, Math.min(50, n)); qtyOut.textContent = String(qty); if (chosen) summary(); };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Order type' },
      ...Object.entries(CHANNEL).map(([k, v]) => h('button', { type: 'button', 'aria-pressed': String(channel === k), onclick: (e) => { channel = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, v)));
    const searchIn = h('input', { class: 'input', type: 'search', placeholder: 'Search the menu', 'aria-label': 'Search the menu', oninput: (e) => { search = e.target.value; draw(); } });
    const catSel = h('select', { class: 'input', 'aria-label': 'Menu category', onchange: (e) => { cat = e.target.value; draw(); } }, h('option', { value: '' }, 'All categories'), ...cats.map((c) => h('option', { value: c }, c)));

    // who is this? A human checks the photo or an ID. The way it was checked is saved with the redemption.
    const idBox = h('div', { class: 'space-y-2' });
    const drawId = () => {
      idBox.replaceChildren(h('div', { class: 'label' }, 'Identity check (required)'),
        h('div', { class: 'seg flex-wrap', role: 'group', 'aria-label': 'How did you check the member?' },
          h('button', { type: 'button', disabled: !m.has_photo, 'aria-pressed': String(identity === 'photo_matched'), onclick: () => { identity = 'photo_matched'; drawId(); } }, 'Photo matches the person'),
          h('button', { type: 'button', 'aria-pressed': String(identity === 'id_checked'), onclick: () => { identity = 'id_checked'; drawId(); } }, 'ID checked, name matches')),
        h('p', { class: 'hint' }, m.has_photo ? 'Compare the registered photo above with the person at the counter.' : 'No photo is registered. Ask for an ID card that matches the registered name. The mobile number alone is not proof of identity.'));
    };
    drawId();

    const summaryBox = h('div', {});
    function summary() {
      const disc = Math.round(chosen.price * m.discount_pct) / 100;
      summaryBox.replaceChildren(h('div', { class: 'state st-available' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '✔'),
        h('div', {}, h('div', { class: 'big' }, `${chosen.name}${chosen.variant ? ' (' + chosen.variant + ')' : ''}`),
          h('div', { class: 'sub' }, `Original price ${money(chosen.price)}  ·  Discount (${m.discount_pct}%) −${money(disc)}  ·  Final price ${money(chosen.price - disc)}`),
          h('div', { class: 'sub' }, qty > 1 ? `${qty} in the order: only ONE unit is discounted. The other ${qty - 1} stay at full price.` : 'Other items in the order stay at regular price.')),
      ), h('div', { class: 'flex gap-2 flex-wrap mt-3' },
        (() => { const b = h('button', { class: 'btn btn-success btn-lg', type: 'button' }, 'Hold this discount');
          b.onclick = () => busy(b, async () => {
            if (!needBranch()) return;
            if (m.require_identity && !identity) { toast('Check who the member is first, then choose how you checked.', 'warn'); return; }
            let r;
            try { r = await rpc('club_reserve', { p_member: m.id, p_product: chosen.id, p_channel: channel, p_branch: branch(), p_qty: qty, p_identity: identity }); } catch (e) { if (e instanceof OfflineError) fail(e); else toast(e.message, 'err'); return; }
            if (!r.ok) { toast(r.message || 'The discount could not be held.', 'err'); await reload(m.id); return; }
            showHold({ id: r.redemption_id, item: r.item_name, qty: r.qty, unit_price: r.unit_price, discount_amount: r.discount_amount, final_price: r.final_price, expires_at: r.expires_at, pct: r.discount_pct }, m);
          }); return b; })(),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { chosen = null; summaryBox.replaceChildren(); } }, 'Choose another item')));
    }
    box.append(h('h2', { class: 'text-lg font-extrabold' }, 'Redeem: choose the ONE item'),
      h('div', { class: 'flex gap-4 items-start flex-wrap' }, photoBox(m.photo_path), h('div', { class: 'flex-1', style: 'min-width:14rem' }, idBox)),
      h('div', { class: 'flex flex-wrap gap-4 items-end' },
        h('div', {}, h('span', { class: 'label' }, 'Order type'), seg),
        h('div', {}, h('span', { class: 'label' }, 'How many of this item are in the order?'),
          h('div', { class: 'flex items-center gap-1' }, h('button', { class: 'btn btn-secondary', type: 'button', 'aria-label': 'One less', onclick: () => setQty(qty - 1) }, '−'), qtyOut,
            h('button', { class: 'btn btn-secondary', type: 'button', 'aria-label': 'One more', onclick: () => setQty(qty + 1) }, '+')))),
      h('p', { class: 'hint' }, 'Dine-in and takeout only. Third-party delivery is not eligible. Branch: ' + ctx.branchName()),
      summaryBox,
      h('div', { class: 'grid gap-2 sm:grid-cols-2' }, searchIn, catSel), list,
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => reload(m.id) }, 'Back'));
    draw();
    out.replaceChildren(stateBanner(m), box);
    searchIn.focus();
  }

  // ---------- step 2: the sale is rung up in the till; mark it redeemed only when it succeeds
  function showHold(hd, m) {
    stopTimer();
    const receipt = h('input', { class: 'input', type: 'text', maxlength: 40, required: true, 'aria-label': 'POS transaction reference', placeholder: 'e.g. 10234' });
    const total = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, 'aria-label': 'Total the member paid', placeholder: 'Type it from the receipt' });
    const countdown = h('span', { class: 'timer' }, '');
    const tick = () => {
      const s = Math.round((new Date(hd.expires_at).getTime() - Date.now()) / 1000);
      countdown.textContent = s > 0 ? `Held for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'The hold time is over. You can still record the sale if it went through.';
    };
    tick(); timerId = setInterval(() => { if (!root.isConnected) { stopTimer(); return; } tick(); }, 1000);
    const done = h('button', { class: 'btn btn-success btn-lg', type: 'button' }, 'Sale completed');
    done.onclick = () => busy(done, async () => {
      if (!receipt.value.trim()) { toast('Enter the POS transaction reference from the till.', 'warn'); receipt.focus(); return; }
      if (!(Number(total.value) >= 0) || total.value === '') { toast('Enter the total the member paid.', 'warn'); total.focus(); return; }
      let r;
      try { r = await rpc('club_complete', { p_id: hd.id, p_receipt: receipt.value.trim(), p_total: Number(total.value) }); } catch (e) { toast(e.message, 'err'); if (e instanceof OfflineError) fail(e); return; }
      showDone(hd, r.member, receipt.value.trim(), r.flags || []);
    });
    const cancel = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel: no sale');
    cancel.onclick = () => busy(cancel, async () => { try { await rpc('club_release', { p_id: hd.id, p_reason: 'Cancelled at the counter' }); toast('Cancelled. Today\'s discount was not used.'); await reload(m.id); } catch (e) { toast(e.message, 'err'); } });
    const change = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Change the item');
    change.onclick = () => busy(change, async () => { try { await rpc('club_release', { p_id: hd.id, p_reason: 'Changed the item' }); const v = await rpc('club_member_view', { p_member: m.id }); showMember(v); startPick(v); } catch (e) { toast(e.message, 'err'); } });
    const disc = hd.discount_amount != null ? hd.discount_amount : null;
    out.replaceChildren(
      h('div', { class: 'state st-held', role: 'status' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '⏳'),
        h('div', {}, h('div', { class: 'big' }, 'DISCOUNT ON HOLD. NOT REDEEMED YET'), h('div', { class: 'sub' }, countdown))),
      h('div', { class: 'card space-y-3' },
        h('div', { class: 'font-extrabold text-lg' }, `${m.name} · ${m.member_no}`),
        h('ol', { class: 'list-decimal pl-5 space-y-1 text-base' },
          h('li', {}, `Ring up the order in the POS (${hd.qty > 1 ? hd.qty + ' × ' : ''}${hd.item}).`),
          h('li', {}, disc != null ? h('span', {}, 'Take ', h('b', {}, money(disc)), ' off ONE ', hd.item, ', labelled "Layover Club ', hd.pct != null ? hd.pct + '%' : '', '". That item costs ', h('b', {}, money(hd.final_price)), '.') : `Apply the member discount so the item costs ${money(hd.final_price)}.`),
          h('li', {}, 'Take payment. Only after the payment succeeds, tap "Sale completed".')),
        h('div', { class: 'grid gap-3 sm:grid-cols-2' }, field('POS transaction reference', receipt), field('Total the member paid (all items)', total)),
        h('div', { class: 'flex gap-2 flex-wrap' }, done, cancel, change),
        h('p', { class: 'hint' }, 'If the customer walks away or the payment fails, tap "Cancel". The member keeps today\'s discount. Nothing is redeemed until the server confirms it.')));
    receipt.focus();
  }

  async function resumeHold(m) {
    try {
      const holds = await rpc('club_open_holds', { p_branch: branch() });
      const hd = holds.find((x) => x.id === m.today.held_id);
      if (!hd) { toast('That hold is no longer open.', 'warn'); reload(m.id); return; }
      showHold({ id: hd.id, item: hd.item, qty: hd.qty, unit_price: hd.unit_price, discount_amount: hd.discount_amount, final_price: hd.final_price, expires_at: hd.expires_at, pct: m.discount_pct }, m);
    } catch (e) { fail(e); }
  }

  function showDone(hd, m, receiptNo, flags) {
    stopTimer();
    const line = (a, b, bold) => h('div', { class: 'flex justify-between gap-3 py-1 ' + (bold ? 'font-extrabold border-t border-slate-300 mt-1 pt-2' : '') }, h('span', {}, a), h('span', { class: 'tabular-nums' }, b));
    out.replaceChildren(...[
      h('div', { class: 'state st-redeemed', role: 'status' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '✔'),
        h('div', {}, h('div', { class: 'big' }, 'REDEMPTION CONFIRMED. TODAY\'S DISCOUNT IS NOW USED'), h('div', { class: 'sub' }, `${m.name} · ${m.days_used} / ${m.days_total} days used · ${m.days_left} days remaining`))),
      flags.length ? h('div', { class: 'card text-sm font-semibold text-orange-800' }, 'Saved. A manager will take a quick look at this one (' + flags.join(', ').toLowerCase().replace(/_/g, ' ') + ').') : null,
      h('div', { class: 'card max-w-sm' },
        h('div', { class: 'font-bold mb-1' }, 'Receipt line (for the POS and your records)'),
        line(`${hd.item}${hd.qty > 1 ? ' (1 of ' + hd.qty + ' discounted)' : ''}`, money(hd.unit_price)),
        line(`Layover Club ${hd.pct}%`, '−' + money(hd.discount_amount)),
        line('Discounted item', money(hd.final_price), true),
        h('div', { class: 'hint mt-2' }, `Member ${m.member_no} · Reference ${receiptNo}`)),
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { q.value = ''; out.replaceChildren(); loadHolds(); q.focus(); } }, 'Next customer')].filter(Boolean));
  }

  // ---------- holds waiting for a sale (so a hold is never lost when the screen changes)
  async function loadHolds() {
    holdsBox.replaceChildren();
    if (!branch() || !ctx.can('redemption.use')) return;
    try {
      const holds = await rpc('club_open_holds', { p_branch: branch() });
      if (!holds.length) return;
      holdsBox.replaceChildren(h('div', { class: 'card space-y-2' }, h('h2', { class: 'font-bold' }, 'Waiting for a sale'),
        ...holds.map((x) => h('button', { class: 'pick', type: 'button', onclick: async () => { try { const v = await rpc('club_member_view', { p_member: x.member_id }); showMember(v); if (x.mine) resumeHold(v); } catch (e) { fail(e); } } },
          h('span', {}, h('span', { class: 'font-bold' }, x.name), h('span', { class: 'hint block' }, `${x.item} · ${money(x.final_price)} · until ${fmtTime(x.expires_at)} · by ${x.by}`)), h('span', {}, x.mine ? 'Resume' : 'Open')))));
    } catch (_) { /* the main screen still works */ }
  }

  root.append(h('h1', { class: 'text-2xl font-extrabold' }, 'Verify member'), form, holdsBox, out);
  loadHolds();
  if (ctx.param) { q.value = ctx.param; lookup(ctx.param); } else { setTimeout(() => q.focus(), 0); }
  return root;
}
