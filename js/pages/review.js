// "Needs Review": prompts to take a look. Never an accusation, and every action leaves an audit record.
import { rpc } from '../api.js';
import { h, badge, fmtDateTime, money, reasonModal, toast, modal, field } from '../ui.js';

const LABEL = { flagged: 'Needs review', repeat_attempts: 'Repeat attempts', override: 'Manual override', restored_often: 'Days given back', high_activity: 'Busy day', no_match: 'Lookups with no match', unfinished_holds: 'Unfinished holds' };

export async function render(ctx) {
  let days = 30;
  const out = h('div', { class: 'space-y-3' });
  const sel = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Period', onchange: () => { days = Number(sel.value); load(); } },
    ...[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([v, l]) => h('option', { value: v, selected: v === days }, l)));

  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const r = await rpc('club_review', { p_days: days });
      if (!r.items.length) { out.replaceChildren(h('div', { class: 'empty' }, 'Nothing needs a look. 🎉')); return; }
      out.replaceChildren(...r.items.map(card));
    } catch (e) { out.replaceChildren(h('div', { class: 'card text-red-800', role: 'alert' }, e.message)); }
  }

  function card(it) {
    const open = it.type === 'flagged' && !it.resolved;
    const actions = h('div', { class: 'flex gap-2 flex-wrap mt-2' });
    if (open && ctx.can('review.resolve')) actions.append(h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => {
      const r = await reasonModal('Mark as checked', 'What did you check?', 'Mark as checked');
      if (r) { try { await rpc('club_review_resolve', { p_id: it.id, p_note: r.reason }); toast('Marked as checked.'); load(); } catch (e) { toast(e.message, 'err'); } }
    } }, 'Mark as checked'));
    if (open && ctx.can('redemption.restore') && it.state === 'redeemed') actions.append(h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => {
      const r = await reasonModal('Give this day back', 'Reason', 'Give the day back');
      if (r) { try { await rpc('club_restore', { p_id: it.id, p_reason: r.reason }); toast('Day given back.'); load(); } catch (e) { toast(e.message, 'err'); } }
    } }, 'Give the day back'));
    if (it.member_id && ctx.can('member.list')) actions.append(h('a', { class: 'btn btn-secondary btn-sm', href: '#/members/' + it.member_id }, 'Open member'));
    return h('div', { class: 'card ' + (it.resolved ? 'opacity-60' : '') },
      h('div', { class: 'flex flex-wrap items-center gap-2' }, badge(LABEL[it.type] || it.type, it.resolved ? 'gray' : 'orange'), it.resolved ? badge('Checked', 'green') : null,
        h('span', { class: 'hint' }, fmtDateTime(it.at))),
      h('div', { class: 'mt-1 font-bold' }, [it.name, it.member_no].filter(Boolean).join(' · ') || '—'),
      h('p', { class: 'text-sm' }, it.text),
      it.type === 'flagged' ? h('p', { class: 'hint' }, [it.branch, it.item, it.receipt && 'receipt ' + it.receipt, it.discount != null && money(it.discount) + ' off', it.by && 'by ' + it.by].filter(Boolean).join(' · ')) : (it.by ? h('p', { class: 'hint' }, 'By ' + it.by) : null),
      it.note ? h('p', { class: 'text-sm' }, 'Note: ', it.note) : null, it.resolved_note ? h('p', { class: 'text-sm' }, 'Checked: ', it.resolved_note) : null, actions);
  }

  load();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Needs Review'),
    h('p', { class: 'muted' }, 'These are prompts to take a quick look, not accusations. A busy day, a typing mistake or a changed mind explains most of them.'), h('div', {}, sel), out);
}
