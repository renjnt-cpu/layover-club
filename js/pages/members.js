// Member Directory and Member Profile (branch managers and Super Admins).
import { rpc } from '../api.js';
import { h, toast, busy, money, fmtDate, fmtDateTime, fmtTime, table, badge, reasonModal, METHOD, CHANNEL } from '../ui.js';
import { stateBanner, usageLine, statusBadge } from '../card.js';
import { openReversal, openEditContact, takePhoto, dropPhoto } from '../actions.js';
import { photoBox } from '../photo.js';

export async function render(ctx) {
  return ctx.param ? profile(ctx, ctx.param) : list(ctx);
}

async function list(ctx) {
  const root = h('div', { class: 'space-y-4' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Membership ID, name or mobile', 'aria-label': 'Search members' });
  const status = h('select', { class: 'input', 'aria-label': 'Status' }, h('option', { value: '' }, 'All statuses'),
    ...[['active', 'Active'], ['expired', 'Expired'], ['suspended', 'Suspended'], ['cancelled', 'Cancelled'], ['pending', 'Not active yet']].map(([v, l]) => h('option', { value: v }, l)));
  const branch = h('select', { class: 'input', 'aria-label': 'Registered at' }, h('option', { value: '' }, 'All branches'), ...ctx.me.branches.map((b) => h('option', { value: b.id }, b.name)));
  const results = h('div', {});
  async function load() {
    results.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const rows = await rpc('club_members_list', { p_search: search.value, p_status: status.value || null, p_branch: branch.value || null, p_limit: 200, p_offset: 0 });
      results.replaceChildren(table([
        { label: 'Member', render: (r) => h('a', { class: 'font-bold underline', href: '#/members/' + r.id }, r.name) },
        { label: 'Membership ID', key: 'member_no' }, { label: 'Mobile', key: 'mobile' },
        { label: 'Status', render: (r) => statusBadge(r.status) }, { label: 'Valid until', render: (r) => fmtDate(r.end) },
        { label: 'Registered at', key: 'branch' }, { label: 'Redemptions', num: true, key: 'redemptions' }, { label: 'Last used', render: (r) => fmtDate(r.last_redeemed) },
      ], rows, { empty: 'No members match.' }), h('p', { class: 'hint mt-2' }, rows.length + ' member(s) shown.'));
    } catch (e) { results.replaceChildren(h('div', { class: 'card text-red-800', role: 'alert' }, e.message)); }
  }
  let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); }); status.addEventListener('change', load); branch.addEventListener('change', load);
  root.append(h('h1', { class: 'text-2xl font-extrabold' }, 'Member directory'), h('div', { class: 'grid gap-2 sm:grid-cols-3' }, search, status, branch), h('div', { class: 'card' }, results));
  load();
  return root;
}

async function profile(ctx, id) {
  const d = await rpc('club_member_detail', { p_member: id });
  const m = d.member;
  if (!m) return h('div', { class: 'card' }, 'Membership not found.');
  const refresh = () => ctx.refresh();
  const act = (label, cls, fn) => { const b = h('button', { class: 'btn ' + cls, type: 'button' }, label); b.onclick = () => busy(b, async () => { try { await fn(); } catch (e) { toast(e.message, 'err'); } }); return b; };
  const actions = h('div', { class: 'flex gap-2 flex-wrap' });
  if (ctx.can('member.renew') && m.record_status === 'active') actions.append(h('a', { class: 'btn btn-primary', href: '#/renew/' + id }, m.status === 'pending' && !(d.periods && d.periods.length) ? 'Take the payment' : 'Renew'));
  if (ctx.can('member.card')) actions.append(h('a', { class: 'btn btn-secondary', href: '#/card/' + id }, 'Digital card'));
  if (ctx.can('member.edit')) actions.append(act('Update contact info', 'btn-secondary', async () => { if (await openEditContact(ctx, m)) refresh(); }));
  if (ctx.can('member.suspend')) {
    if (m.record_status === 'active') {
      actions.append(act('Suspend', 'btn-secondary', async () => { const r = await reasonModal('Suspend membership', 'Reason', 'Suspend'); if (r) { await rpc('club_set_status', { p_member: id, p_status: 'suspended', p_reason: r.reason }); refresh(); } }));
      actions.append(act('Cancel membership', 'btn-danger', async () => { const r = await reasonModal('Cancel membership', 'Reason', 'Cancel membership', true); if (r) { await rpc('club_set_status', { p_member: id, p_status: 'cancelled', p_reason: r.reason }); refresh(); } }));
    } else {
      actions.append(act('Reopen membership', 'btn-secondary', async () => { const r = await reasonModal('Reopen membership', 'Reason', 'Reopen'); if (r) { await rpc('club_set_status', { p_member: id, p_status: 'active', p_reason: r.reason }); refresh(); } }));
    }
  }
  if (ctx.can('member.replace_card')) actions.append(act('Replace compromised QR / card', 'btn-secondary', async () => {
    const r = await reasonModal('Replace the QR code', 'Why (lost, damaged, shared, compromised)?', 'Issue new QR');
    if (r) { await rpc('club_replace_card', { p_member: id, p_reason: r.reason }); toast('New QR issued. The old QR is revoked and no longer works.'); refresh(); }
  }));

  const photoActions = h('div', { class: 'flex gap-2 flex-wrap mt-2' });
  if (!m.has_photo && ctx.can('member.photo')) photoActions.append(act('Take photo', 'btn-secondary btn-sm', async () => { if (await takePhoto(ctx, m)) refresh(); }));
  if (m.has_photo && ctx.can('member.photo_remove')) {
    photoActions.append(act('Replace photo', 'btn-secondary btn-sm', async () => { const r = await reasonModal('Replace the photo', 'Reason', 'Remove the old photo', true); if (r) { const { removeMemberPhoto } = await import('../photo.js'); await removeMemberPhoto(id, r.reason); if (await takePhoto(ctx, m)) { /* new photo saved */ } refresh(); } }));
    photoActions.append(act('Remove photo', 'btn-secondary btn-sm', async () => { if (await dropPhoto(ctx, m)) refresh(); }));
  }

  const periods = table([
    { label: '#', key: 'no' }, { label: 'Type', render: (p) => p.kind === 'new' ? 'New' : 'Renewal' }, { label: 'Activated', render: (p) => fmtDate(p.start) },
    { label: 'Expires', render: (p) => fmtDate(p.end) + (p.original_end ? ' (was ' + fmtDate(p.original_end) + ')' : '') }, { label: 'Fee', num: true, render: (p) => money(p.fee) },
    { label: 'Paid by', render: (p) => (METHOD[p.method] || p.method) + (p.ref ? ' · ' + p.ref : '') }, { label: 'Branch', key: 'branch' }, { label: 'Staff', key: 'by' }, { label: 'Date', render: (p) => fmtDateTime(p.at) },
  ], d.periods, { empty: 'No membership periods yet (no verified payment).' });

  const PAY = { verified: ['Verified', 'green'], pending: ['Waiting to be verified', 'yellow'], rejected: ['Rejected', 'red'] };
  const payments = table([
    { label: 'Recorded', render: (p) => fmtDateTime(p.recorded_at) }, { label: 'Type', render: (p) => p.kind === 'new' ? 'Membership' : 'Renewal' }, { label: 'Amount', num: true, render: (p) => money(p.amount) },
    { label: 'Paid by', render: (p) => (METHOD[p.method] || p.method) + (p.reference ? ' · ' + p.reference : '') }, { label: 'Status', render: (p) => badge(...(PAY[p.status] || [p.status, 'gray'])) },
    { label: 'Branch', key: 'branch' }, { label: 'Recorded by', key: 'recorded_by' }, { label: 'Verified by', render: (p) => p.verified_by ? p.verified_by + (p.reject_reason ? ': ' + p.reject_reason : '') : '' },
  ], d.payments, { empty: 'No payments.' });

  const RSTATE = { redeemed: ['Redeemed', 'green'], reserved: ['On hold', 'yellow'], released: ['Cancelled hold', 'gray'], expired: ['Hold ended', 'gray'], restored: ['Day given back', 'blue'] };
  const IDM = { photo_matched: 'Photo matched', id_checked: 'ID checked', otp: 'OTP' };
  const reds = table([
    { label: 'Date', render: (r) => fmtDate(r.date) }, { label: 'Time', render: (r) => fmtTime(r.at) }, { label: 'State', render: (r) => badge(...(RSTATE[r.state] || [r.state, 'gray'])) },
    { label: 'Branch', key: 'branch' }, { label: 'Item', render: (r) => r.item + (r.channel ? ' · ' + (CHANNEL[r.channel] || r.channel) : '') },
    { label: 'Original', num: true, render: (r) => money(r.price) }, { label: 'Discount', num: true, render: (r) => money(r.discount) }, { label: 'Final', num: true, render: (r) => money(r.final) },
    { label: 'Processed by', key: 'by' }, { label: 'Transaction #', key: 'receipt' }, { label: 'ID check', render: (r) => IDM[r.identity] || '' },
    { label: 'Review', render: (r) => r.flags && r.flags.length ? badge((r.flags_open ? 'Needs review: ' : 'Reviewed: ') + r.flags.join(', ').toLowerCase().replace(/_/g, ' '), r.flags_open ? 'orange' : 'gray') : '' },
    { label: '', render: (r) => (r.state === 'redeemed' || r.state === 'reserved') && ctx.can('redemption.restore')
        ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => { const x = await reasonModal('Give this day back', 'Reason', 'Give the day back'); if (x) { try { await rpc('club_restore', { p_id: r.id, p_reason: x.reason }); toast('Day given back.'); refresh(); } catch (e) { toast(e.message, 'err'); } } } }, 'Give day back')
        : (r.state === 'redeemed' ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openReversal(ctx, r.id, refresh) }, 'Voided / refunded?') : '') },
  ], d.redemptions, { empty: 'No redemptions yet.' });

  const audit = table([
    { label: 'When', render: (a) => fmtDateTime(a.at) }, { label: 'Who', key: 'by' }, { label: 'Action', render: (a) => String(a.action).replace('club.', '').replace(/_/g, ' ') }, { label: 'Reason', key: 'reason' },
    { label: 'Before → After', render: (a) => (a.before ? JSON.stringify(a.before) : '') + (a.after ? ' → ' + JSON.stringify(a.after) : '') },
  ], d.audit, { empty: 'No changes recorded.' });

  return h('div', { class: 'space-y-4' },
    h('a', { href: '#/members', class: 'underline text-sm' }, '← Member directory'),
    stateBanner(m),
    h('div', { class: 'card space-y-3' },
      h('div', { class: 'flex gap-4 items-start flex-wrap' }, h('div', {}, photoBox(m.photo_path), photoActions),
        h('div', { class: 'min-w-0 flex-1 space-y-2' }, h('div', { class: 'flex items-start justify-between gap-2 flex-wrap' }, h('div', {}, h('h1', { class: 'text-2xl font-extrabold break-words' }, m.name), h('div', { class: 'font-mono text-lg' }, m.member_no)), statusBadge(m.status)),
          h('div', { class: 'text-sm space-y-1' }, h('div', {}, 'Mobile: ', h('b', {}, m.mobile || '')), m.email ? h('div', {}, 'Email: ', h('b', {}, m.email)) : null,
            h('div', {}, 'Registered: ', h('b', {}, fmtDate(m.since))), h('div', {}, 'Cards issued: ', h('b', {}, String(m.cards_issued)))))),
      usageLine(m), actions),
    h('section', { class: 'space-y-2' }, h('h2', { class: 'font-bold text-lg' }, 'Payment history'), h('div', { class: 'card' }, payments)),
    h('section', { class: 'space-y-2' }, h('h2', { class: 'font-bold text-lg' }, 'Membership periods and renewals'), h('div', { class: 'card' }, periods)),
    h('section', { class: 'space-y-2' }, h('h2', { class: 'font-bold text-lg' }, 'Redemption history (newest first)'), h('div', { class: 'card' }, reds),
      h('p', { class: 'hint' }, 'Total redemptions: ' + d.redemptions.filter((r) => r.state === 'redeemed').length + '. Today\'s benefit and the total count are shown separately on purpose: unused days do not accumulate.')),
    h('section', { class: 'space-y-2' }, h('h2', { class: 'font-bold text-lg' }, 'Changes and overrides'), h('div', { class: 'card' }, audit)));
}
