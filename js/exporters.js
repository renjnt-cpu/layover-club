// Report exports: Excel and PDF are made in the browser from the rows already on screen. The libraries load only when you click.
import { toast } from './ui.js';

const safe = (v) => (v == null ? '' : typeof v === 'number' ? v : String(v));

export async function exportXlsx(name, rows) {
  if (!rows.length) { toast('Nothing to export.', 'warn'); return; }
  try {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(v)]))));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, name + '.xlsx');
  } catch (e) { toast('Excel export could not load (internet needed): ' + e.message, 'err'); }
}

export async function exportPdf(name, title, rows) {
  if (!rows.length) { toast('Nothing to export.', 'warn'); return; }
  try {
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const mod = await import('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.5.31/+esm');
    const autoTable = typeof mod.default === 'function' ? mod.default : (mod.default && mod.default.default) || mod.autoTable;
    if (typeof autoTable !== 'function') throw new Error('table plugin not found');
    const cols = Object.keys(rows[0]);
    const doc = new jsPDF({ orientation: cols.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(13); doc.text(title, 28, 30);
    autoTable(doc, { head: [cols], body: rows.map((r) => cols.map((c) => String(safe(r[c])))), startY: 40, styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [6, 66, 184] }, margin: { left: 28, right: 28 } });
    doc.save(name + '.pdf');
  } catch (e) { toast('PDF export could not load (internet needed): ' + e.message, 'err'); }
}
