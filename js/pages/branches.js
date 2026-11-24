// Branch Management. Branches are shared with the other Layover apps, so a new branch here appears there too.
import { rpc } from '../api.js';
import { h, toast, busy, field, table, badge, modal, num } from '../ui.js';

export async function render(ctx) {
  const out = h('div', { class: 'card' });
  const edit = (b) => {
    const name = h('input', { class: 'input', type: 'text', required: true, value: b ? b.name : '', placeholder: 'e.g. Layover Dessert Café, Mactan' });
    const code = h('input', { class: 'input', type: 'text', required: true, maxlength: 6, value: b ? b.code : '', placeholder: 'Short code, e.g. MCT' });
    const address = h('input', { class: 'input', type: 'text', value: b && b.address ? b.address : '' });
    const active = h('input', { type: 'checkbox', checked: b ? b.is_active : true, style: 'width:1.5rem;height:1.5rem' });
    return modal({ title: b ? 'Edit branch' : 'Add a branch', submitLabel: 'Save branch',
      body: h('div', { class: 'space-y-3' }, field('Branch name', name), field('Code', code), field('Address', address), h('label', { class: 'flex items-center gap-2 font-semibold' }, active, 'Active (can register, verify and redeem)'),
        h('p', { class: 'hint' }, 'Branches are shared with the other Layover apps. Turning a branch off stops new Club activity there; its history stays.')),
      onSubmit: async () => { await rpc('club_branch_save', { p_id: b ? b.id : null, p_name: name.value, p_code: code.value, p_address: address.value, p_active: active.checked }); toast('Saved. Reload the page to see the branch list in the top bar.'); return true; } });
  };
  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const rows = await rpc('club_branches_admin');
      out.replaceChildren(table([
        { label: 'Branch', key: 'name' }, { label: 'Code', key: 'code' }, { label: 'Address', key: 'address' }, { label: 'Status', render: (r) => r.is_active ? badge('Active', 'green') : badge('Off', 'gray') },
        { label: 'Members', num: true, render: (r) => num(r.members) }, { label: 'Redemptions', num: true, render: (r) => num(r.redemptions) },
        { label: '', render: (r) => h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => { try { if (await edit(r)) load(); } catch (e) { toast(e.message, 'err'); } } }, 'Edit') },
      ], rows, { empty: 'No branches.' }));
    } catch (e) { out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }
  load();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Branch management'),
    h('p', { class: 'muted' }, 'All branches share one member database. A member who redeems at one branch cannot redeem again anywhere that day.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { if (await edit(null)) load(); } catch (e) { toast(e.message, 'err'); } } }, 'Add a branch'), out);
}
