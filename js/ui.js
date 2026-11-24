import { TZ } from './config.js';

// Builds DOM without innerHTML, so names, notes and receipt numbers can never run as code.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function toast(msg, kind = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = h('div', { class: 'toast ' + (kind === 'err' ? 'bg-red-700' : kind === 'warn' ? 'bg-amber-700' : 'bg-slate-800'), role: kind === 'err' ? 'alert' : 'status' }, msg);
  root.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}

export const money = (n) => (n == null || n === '' ? '' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const num = (n) => (n == null ? '' : Number(n).toLocaleString('en-PH'));
export function fmtDate(d) {            // 'YYYY-MM-DD' (a plain calendar date, no time zone shifting)
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, day));
}
export function fmtTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}
export function fmtDateTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}
export const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function manilaToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); }
export function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); }

export function badge(text, color = 'gray') { return h('span', { class: 'badge b-' + color }, text); }
export function section(title, ...kids) { return h('section', { class: 'space-y-2' }, h('h2', { class: 'font-bold text-lg' }, title), ...kids); }
export function field(label, input, hint) { return h('label', { class: 'block' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'hint block mt-1' }, hint) : null); }

// Runs an async action while a button is disabled, and shows errors as a toast.
export async function busy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message || String(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// A small dialog. Resolves with the object returned by onSubmit, or null when cancelled.
export function modal({ title, body, submitLabel = 'Confirm', danger = false, onSubmit }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
    const ok = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'submit' }, submitLabel);
    const form = h('form', { class: 'space-y-3', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; ok.disabled = true;
      try { const r = await onSubmit(); close(r === undefined ? true : r); }
      catch (ex) { err.textContent = ex.message || String(ex); ok.disabled = false; }
    } }, body, err,
      h('div', { class: 'flex gap-2 justify-end' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'modal' }, h('h2', { class: 'font-extrabold text-lg mb-2' }, title), form));
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    const first = form.querySelector('input,select,textarea');
    (first || ok).focus();
  });
}

export function reasonModal(title, label, submitLabel, danger) {
  const ta = h('textarea', { class: 'input', rows: 3, required: true, minlength: 3, placeholder: 'Write the reason (it is saved in the audit log)' });
  return modal({ title, submitLabel, danger, body: field(label, ta), onSubmit: async () => { if (ta.value.trim().length < 3) throw new Error('A reason is required.'); return { reason: ta.value.trim() }; } });
}

export function table(cols, rows, opts = {}) {
  if (!rows || !rows.length) return h('div', { class: 'empty' }, opts.empty || 'Nothing here yet.');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    opts.caption ? h('caption', { class: 'text-left text-xs muted pb-1' }, opts.caption) : null,
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : (r[c.key] ?? ''))))))));
}

export function downloadCsv(name, rows) {
  if (!rows.length) { toast('Nothing to export.', 'warn'); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export const CHANNEL = { dine_in: 'Dine-in', takeout: 'Takeout' };
export const METHOD = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card', bank_transfer: 'Bank transfer', other: 'Other' };
