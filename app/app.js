import { ack, fetchIncidents } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const acked = new Set();
let refreshing = false;
let drawn = '';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatLocal(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(navigator.language, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function ordered(incidents) {
  return [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

function signature(incidents) {
  return incidents
    .map((incident) =>
      [incident.id, incident.openedAt, incident.severity, incident.service, incident.region, incident.summary, acked.has(incident.id)].join('|'),
    )
    .join('\n');
}

function render(incidents) {
  const rows = ordered(incidents);
  const next = signature(rows);
  if (next === drawn) return;
  drawn = next;
  empty.hidden = rows.length !== 0;
  list.hidden = rows.length === 0;
  list.innerHTML = rows
    .map((incident) => {
      const severity = /^sev[1-3]$/.test(incident.severity) ? incident.severity : '';
      const action = acked.has(incident.id)
        ? '<span data-testid="acked">acked</span>'
        : '<button type="button" data-testid="ack">Ack</button>';
      return `<li data-testid="incident-row" data-id="${escapeHtml(incident.id)}" class="row ${severity}">
        <span class="id">${escapeHtml(incident.id)}</span>
        <span class="sev">${escapeHtml(incident.severity)}</span>
        <span class="what">${escapeHtml(incident.service)} · ${escapeHtml(incident.region)} · ${escapeHtml(incident.summary)}</span>
        <time datetime="${escapeHtml(incident.openedAt)}">${escapeHtml(formatLocal(incident.openedAt))}</time>
        ${action}
      </li>`;
    })
    .join('');
}

async function refresh() {
  if (refreshing) return;
  if (list.querySelector('[data-testid="ack"][disabled]')) return;
  refreshing = true;
  try {
    const page = await fetchIncidents();
    if (loader.isConnected) loader.remove();
    render(page.incidents);
  } catch (error) {
    console.error(error);
  } finally {
    refreshing = false;
  }
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button || button.disabled) return;
  const row = button.closest('[data-testid="incident-row"]');
  const id = row?.dataset.id;
  if (!id || acked.has(id)) return;
  button.disabled = true;
  try {
    const reply = await ack(id);
    acked.add(id);
    drawn = '';
    const mark = document.createElement('span');
    mark.dataset.testid = 'acked';
    mark.textContent = 'acked';
    button.replaceWith(mark);
    console.info('acked-on-board', reply.id);
  } catch (error) {
    button.disabled = false;
    console.error(error);
  }
});

await refresh();
setInterval(refresh, 2000);
