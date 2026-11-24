// Settings: ONE membership configuration, the menu and eligibility, the terms, staff access, and the settings history.
// A save adds a new version. Past memberships and redemptions keep the terms they were made under.
import { rpc } from '../api.js';
import { h, toast, busy, field, table, money, fmtDateTime, modal, CHANNEL, badge } from '../ui.js';

export async function render(ctx) {
  const tabsAll = [['rules', 'Rules', 'settings.edit'], ['menu', 'Menu & eligibility', 'products.edit'], ['terms', 'Terms & privacy', 'settings.edit'], ['history', 'History', 'settings.edit']];
  const tabs = tabsAll.filter(([, , p]) => ctx.can(p));
  let cur = tabs[0][0];
  const bar = h('div', { class: 'flex gap-2 flex-wrap', role: 'tablist', 'aria-label': 'Settings' });
  const body = h('div', { class: 'space-y-4' });
  let cache = null;
  const getSettings = async (force) => { if (!cache || force) cache = await rpc('club_settings_get'); return cache; };
  const drawBar = () => bar.replaceChildren(...tabs.map(([k, l]) => h('button', { class: 'btn btn-sm ' + (k === cur ? 'btn-primary' : 'btn-secondary'), type: 'button', role: 'tab', 'aria-selected': String(k === cur), onclick: () => { cur = k; drawBar(); show(); } }, l)));
  async function show() {
    body.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try { body.replaceChildren(await ({ rules, menu, terms, history }[cur])()); }
    catch (e) { body.replaceChildren(h('div', { class: 'card text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }

  // ------------------------------------------------ rules
  async function rules() {
    const { settings: s } = await getSettings(true);
    const num = (v, o = {}) => h('input', { class: 'input', type: 'number', step: o.step || '1', min: o.min ?? '0', value: v == null ? '' : String(v) });
    const f = {
      fee: num(s.fee, { step: '0.01' }), renewal_fee: num(s.renewal_fee, { step: '0.01' }), validity_days: num(s.validity_days, { min: 1 }), discount_pct: num(s.discount_pct, { step: '0.01', min: 1 }),
      daily_limit: num(s.daily_limit, { min: 1 }), reservation_minutes: num(s.reservation_minutes, { min: 5 }), high_activity_per_day: num(s.high_activity_per_day, { min: 1 }), expiry_alert_days: num(s.expiry_alert_days, { min: 1 }),
      other_cost_pct: num(s.other_cost_pct, { step: '0.01' }), session_idle_minutes: num(s.session_idle_minutes, { min: 5 }), app_url: h('input', { class: 'input', type: 'url', value: s.app_url || '', placeholder: 'https://… (the address of this app)' }),
    };
    const early = h('input', { type: 'checkbox', checked: s.allow_early_renewal, style: 'width:1.5rem;height:1.5rem' });
    const late = h('input', { type: 'checkbox', checked: s.allow_late_confirm, style: 'width:1.5rem;height:1.5rem' });
    const qrUrl = h('input', { type: 'checkbox', checked: s.qr_as_url, style: 'width:1.5rem;height:1.5rem' });
    const cashAuto = h('input', { type: 'checkbox', checked: s.cash_auto_verify, style: 'width:1.5rem;height:1.5rem' });
    const needId = h('input', { type: 'checkbox', checked: s.require_identity_check, style: 'width:1.5rem;height:1.5rem' });
    const rs = h('select', { class: 'input' }, h('option', { value: 'after_expiry', selected: s.renewal_start === 'after_expiry' }, 'After the current expiry (recommended)'), h('option', { value: 'today', selected: s.renewal_start === 'today' }, 'Today (cuts the days left in the current period)'));
    const pol = h('select', { class: 'input' }, h('option', { value: 'manual', selected: s.restoration_policy === 'manual' }, 'A manager decides every time (recommended)'), h('option', { value: 'auto_on_void', selected: s.restoration_policy === 'auto_on_void' }, 'Give the day back automatically when the whole order is voided'));
    const roll = h('select', { class: 'input' }, ...[0, 1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: s.day_rollover_hour === n }, n === 0 ? 'Midnight (calendar day)' : `${n}:00 AM (12AM to ${n}AM counts as the day before)`)));
    const chans = Object.entries(CHANNEL).map(([k, v]) => ({ k, box: h('input', { type: 'checkbox', checked: (s.allowed_channels || []).includes(k), style: 'width:1.5rem;height:1.5rem' }), v }));
    const note = h('input', { class: 'input', type: 'text', placeholder: 'Why are you changing this? (optional)' });
    const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save as a new version');
    const form = h('form', { class: 'card space-y-4', onsubmit: (e) => {
      e.preventDefault(); err.textContent = '';
      const patch = {};
      const setIf = (k, v) => { if (JSON.stringify(v) !== JSON.stringify(s[k])) patch[k] = v; };
      ['fee', 'renewal_fee', 'discount_pct'].forEach((k) => setIf(k, Number(f[k].value)));
      ['validity_days', 'daily_limit', 'reservation_minutes', 'high_activity_per_day', 'expiry_alert_days'].forEach((k) => setIf(k, Number(f[k].value)));
      setIf('other_cost_pct', f.other_cost_pct.value === '' ? null : Number(f.other_cost_pct.value));
      setIf('app_url', f.app_url.value.trim() || null); setIf('allow_early_renewal', early.checked); setIf('allow_late_confirm', late.checked); setIf('qr_as_url', qrUrl.checked);
      setIf('renewal_start', rs.value); setIf('restoration_policy', pol.value); setIf('day_rollover_hour', Number(roll.value));
      setIf('allowed_channels', chans.filter((c) => c.box.checked).map((c) => c.k));
      setIf('cash_auto_verify', cashAuto.checked); setIf('require_identity_check', needId.checked); setIf('session_idle_minutes', Number(f.session_idle_minutes.value));
      if (!Object.keys(patch).length) { err.textContent = 'Nothing changed.'; return; }
      busy(save, async () => {
        try { await rpc('club_settings_save', { p_patch: patch, p_note: note.value.trim() || null }); toast('Saved. New memberships, renewals and future redemptions use the new rules.'); cache = null; show(); }
        catch (ex) { err.textContent = ex.message; }
      });
    } },
      h('p', { class: 'text-sm font-semibold bg-amber-50 border border-amber-300 rounded-lg p-2' }, 'Changes apply to new memberships, renewals and future redemptions. Members already paid up keep the fee, discount and daily limit they bought, and past records are never recalculated.'),
      h('h2', { class: 'font-extrabold text-lg' }, 'Membership'),
      h('div', { class: 'grid gap-3 sm:grid-cols-2' }, field('Membership fee (₱)', f.fee), field('Renewal fee (₱)', f.renewal_fee), field('Validity (calendar days)', f.validity_days),
        field('Discount (%)', f.discount_pct), field('Discounted items per day', f.daily_limit, 'The brief says one a day.'), field('Hold time at the counter (minutes)', f.reservation_minutes, 'How long a held discount waits for the sale.')),
      h('div', {}, h('span', { class: 'label' }, 'Eligible order types'), h('div', { class: 'flex gap-4 flex-wrap' }, ...chans.map((c) => h('label', { class: 'flex items-center gap-2 font-semibold' }, c.box, c.v)),
        h('span', { class: 'hint' }, 'Third-party delivery is never eligible.'))),
      h('h2', { class: 'font-extrabold text-lg' }, 'Payments and identity'),
      h('label', { class: 'flex items-center gap-2 font-semibold' }, cashAuto, 'Cash is verified at the counter (activates at once). Off = every payment waits for a manager.'),
      h('label', { class: 'flex items-center gap-2 font-semibold' }, needId, 'The cashier must confirm how the member was identified (photo or ID) before every discount'),
      field('Sign staff out after this many idle minutes', f.session_idle_minutes, 'Sessions also expire on the server. Shared counter tablets should use a short time.'),
      h('h2', { class: 'font-extrabold text-lg' }, 'Renewal and voids'),
      h('div', { class: 'grid gap-3 sm:grid-cols-2' }, field('Renewal starts', rs), field('Restoring a day after a void', pol)),
      h('label', { class: 'flex items-center gap-2 font-semibold' }, early, 'Allow early renewal'),
      h('label', { class: 'flex items-center gap-2 font-semibold' }, late, 'Allow recording a sale after the hold time ran out (flagged for review)'),
      h('h2', { class: 'font-extrabold text-lg' }, 'Business day'),
      field('When does a business day start?', roll, 'The shop closes at 3AM. At midnight a member could redeem at 11:50 PM and again at 12:10 AM. Pick 3:00 AM to treat 12AM to 3AM as the day before.'),
      h('h2', { class: 'font-extrabold text-lg' }, 'Profitability and alerts'),
      h('div', { class: 'grid gap-3 sm:grid-cols-3' }, field('Cost of the rest of a member order (% of its price)', f.other_cost_pct, 'Leave blank if unknown. The dashboard then says the contribution is partial.'),
        field('Very busy staff day (redemptions)', f.high_activity_per_day), field('Expiring soon (days)', f.expiry_alert_days)),
      h('h2', { class: 'font-extrabold text-lg' }, 'QR code'),
      field('Address of this app', f.app_url, 'Used inside the QR so a phone camera opens the staff app. Leave blank to use the address you are on now.'),
      h('label', { class: 'flex items-center gap-2 font-semibold' }, qrUrl, 'Put a link in the QR (off = the QR holds only the secret code)'),
      field('Note', note), err, save);
    return form;
  }

  // ------------------------------------------------ menu & eligibility
  async function menu() {
    const [{ settings: s, categories }, prods] = await Promise.all([getSettings(true), rpc('club_products_admin')]);
    const catBoxes = categories.map((c) => ({ c, box: h('input', { type: 'checkbox', checked: (s.eligible_categories || []).includes(c), style: 'width:1.4rem;height:1.4rem' }) }));
    const catSave = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Save eligible categories');
    catSave.onclick = () => busy(catSave, async () => { try { await rpc('club_settings_save', { p_patch: { eligible_categories: catBoxes.filter((x) => x.box.checked).map((x) => x.c) }, p_note: 'Eligible categories changed' }); toast('Saved.'); cache = null; show(); } catch (e) { toast(e.message, 'err'); } });
    const filter = h('input', { class: 'input', type: 'search', placeholder: 'Find a product', 'aria-label': 'Find a product' });
    const tbl = h('div', {});
    const drawRows = () => {
      const q = filter.value.toLowerCase();
      const rows = prods.filter((p) => !q || (p.name + ' ' + (p.variant || '') + ' ' + p.category).toLowerCase().includes(q));
      tbl.replaceChildren(table([
        { label: 'Product', render: (p) => h('span', {}, h('b', {}, p.name), p.variant ? ' · ' + p.variant : '', h('span', { class: 'hint block' }, p.category)) },
        { label: 'Eligible', render: (p) => p.eligible ? badge('Eligible', 'green') : badge('Not eligible', 'gray') },
        { label: 'Rule', render: (p) => { const sel = h('select', { class: 'input', style: 'min-width:9rem', 'aria-label': 'Eligibility rule for ' + p.name },
            h('option', { value: '', selected: p.eligible_override == null }, 'Follow category'), h('option', { value: 'true', selected: p.eligible_override === true }, 'Always eligible'), h('option', { value: 'false', selected: p.eligible_override === false }, 'Never eligible'));
          sel.onchange = async () => { try { await rpc('club_product_save', { p_id: p.id, p_patch: { eligible_override: sel.value === '' ? null : sel.value === 'true' } }); toast('Saved.'); show(); } catch (e) { toast(e.message, 'err'); } }; return sel; } },
        { label: 'Price (₱)', render: (p) => numCell(p, 'price') }, { label: 'Product cost (₱)', render: (p) => numCell(p, 'unit_cost', 'unknown') },
        { label: 'Active', render: (p) => { const c = h('input', { type: 'checkbox', checked: p.is_active, style: 'width:1.4rem;height:1.4rem', 'aria-label': 'Active: ' + p.name }); c.onchange = async () => { try { await rpc('club_product_save', { p_id: p.id, p_patch: { is_active: c.checked } }); toast('Saved.'); } catch (e) { toast(e.message, 'err'); c.checked = !c.checked; } }; return c; } },
      ], rows, { empty: 'No product matches.' }));
    };
    function numCell(p, key, ph) {
      const i = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', style: 'width:6.5rem', value: p[key] == null ? '' : String(p[key]), placeholder: ph || '', 'aria-label': (key === 'price' ? 'Price of ' : 'Cost of ') + p.name });
      i.onchange = async () => { try { await rpc('club_product_save', { p_id: p.id, p_patch: { [key]: i.value === '' ? null : Number(i.value) } }); p[key] = i.value === '' ? null : Number(i.value); toast('Saved.'); } catch (e) { toast(e.message, 'err'); i.value = p[key] == null ? '' : String(p[key]); } };
      return i;
    }
    filter.addEventListener('input', drawRows); drawRows();
    const missing = prods.filter((p) => p.is_active && p.unit_cost == null).length;
    return h('div', { class: 'space-y-4' },
      h('div', { class: 'card space-y-2' }, h('h2', { class: 'font-extrabold text-lg' }, 'Eligible categories'), h('p', { class: 'hint' }, 'A new category on the menu is NOT eligible until you tick it here. Add-ons start unticked.'),
        h('div', { class: 'grid gap-2 sm:grid-cols-2' }, ...catBoxes.map((x) => h('label', { class: 'flex items-center gap-2 font-semibold' }, x.box, x.c))), catSave),
      h('div', { class: 'card space-y-2' }, h('h2', { class: 'font-extrabold text-lg' }, 'Products, prices and costs'),
        h('p', { class: 'hint' }, `The discount is worked out from the price here when the discount is held, so keep prices matching the till. Product cost makes the profitability figures real. ${missing} active product(s) have no cost yet.`), filter, tbl));
  }

  // ------------------------------------------------ terms
  async function terms() {
    const { terms: clauses, settings: s } = await getSettings(true);
    const edit = h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => {
      const ta = h('textarea', { class: 'input', rows: 10, value: clauses.join('\n') });
      const why = h('input', { class: 'input', type: 'text', required: true, placeholder: 'Why are the terms changing?' });
      const r = await modal({ title: 'Edit the terms (new version)', submitLabel: 'Publish new terms', body: h('div', { class: 'space-y-3' }, h('p', { class: 'text-sm font-bold text-orange-800' }, 'Do not change legal wording without the owner\'s sign-off. Members keep the version they agreed to; new registrations show the new version.'), field('One clause per line', ta), field('Reason', why)),
        onSubmit: async () => { const lines = ta.value.split('\n').map((x) => x.trim()).filter(Boolean); await rpc('club_terms_save', { p_clauses: lines, p_note: why.value.trim() }); return true; } });
      if (r) { toast('New terms published.'); cache = null; show(); }
    } }, 'Edit terms');
    const editPrivacy = h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => {
      const ta = h('textarea', { class: 'input', rows: 12, value: s.privacy_notice });
      const r = await modal({ title: 'Edit the privacy notice', submitLabel: 'Save notice', body: h('div', { class: 'space-y-3' }, h('p', { class: 'text-sm font-bold text-orange-800' }, 'Have the notice reviewed for the Data Privacy Act (RA 10173) before relying on it. It is shown to every member at registration.'), field('Privacy notice', ta)),
        onSubmit: async () => { await rpc('club_settings_save', { p_patch: { privacy_notice: ta.value.trim() }, p_note: 'Privacy notice changed' }); return true; } });
      if (r) { toast('Privacy notice saved.'); cache = null; show(); }
    } }, 'Edit privacy notice');
    return h('div', { class: 'space-y-4' },
      h('div', { class: 'card space-y-3' }, h('h2', { class: 'font-extrabold text-lg' }, 'LAYOVER CLUB MEMBERSHIP TERMS (version ' + s.terms_version + ')'), h('ol', { class: 'list-decimal pl-5 space-y-1' }, ...clauses.map((c) => h('li', {}, c))), edit),
      h('div', { class: 'card space-y-3' }, h('h2', { class: 'font-extrabold text-lg' }, 'Privacy notice shown at registration'), h('p', { class: 'text-sm whitespace-pre-wrap' }, s.privacy_notice),
        h('p', { class: 'hint' }, 'This is a plain-language draft. It has not been reviewed by a lawyer.'), editPrivacy));
  }

  // ------------------------------------------------ history
  async function history() {
    const d = await getSettings(true);
    return h('div', { class: 'card space-y-2' }, h('h2', { class: 'font-extrabold text-lg' }, 'Settings versions'),
      h('p', { class: 'hint' }, 'Every save adds a version. Memberships and redemptions keep the version they were made under. Every change is also in the audit log (Reports → Audit log).'),
      table([{ label: 'Version', key: 'version' }, { label: 'When', render: (r) => fmtDateTime(r.at) }, { label: 'By', key: 'by' }, { label: 'Fee', num: true, render: (r) => money(r.fee) },
        { label: 'Discount', num: true, render: (r) => r.discount_pct + '%' }, { label: 'Days', num: true, key: 'validity_days' }, { label: 'Note', key: 'note' }], d.history));
  }

  drawBar(); show();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Settings'), bar, body);
}
