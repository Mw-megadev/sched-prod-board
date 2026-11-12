import { ack, fetchIncidents } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const bar = document.querySelector('[data-testid="new-bar"]');

const acked = new Set();
const pending = new Map();
let shown = [];
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

function renderBar() {
  const count = pending.size;
  bar.hidden = count === 0;
  bar.textContent = count === 0 ? '' : `${count} new`;
}

function renderList() {
  const next = shown.map((incident) => `${incident.id}|${acked.has(incident.id)}`).join('\n');
  empty.hidden = shown.length !== 0;
  list.hidden = shown.length === 0;
  if (next === drawn) return;
  drawn = next;
  list.innerHTML = shown
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

function reveal() {
  if (pending.size === 0) return;
  const incoming = ordered([...pending.values()]);
  pending.clear();
  const incomingIds = new Set(incoming.map((incident) => incident.id));
  shown = [...incoming, ...shown.filter((incident) => !incomingIds.has(incident.id))];
  drawn = '';
  renderList();
  renderBar();
}

function applyPage(incidents) {
  const latest = ordered(incidents);
  if (shown.length === 0 && pending.size === 0) {
    shown = latest;
    renderList();
    renderBar();
    return;
  }
  const shownIds = new Set(shown.map((incident) => incident.id));
  const latestIds = new Set(latest.map((incident) => incident.id));
  for (const incident of latest) {
    if (!shownIds.has(incident.id)) pending.set(incident.id, incident);
  }
  for (const id of [...pending.keys()]) {
    if (!latestIds.has(id)) pending.delete(id);
  }
  renderBar();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const page = await fetchIncidents();
    if (loader.isConnected) loader.remove();
    applyPage(page.incidents);
  } catch (error) {
    console.error(error);
  } finally {
    refreshing = false;
  }
}

bar.addEventListener('click', () => {
  reveal();
});

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
    const mark = document.createElement('span');
    mark.dataset.testid = 'acked';
    mark.textContent = 'acked';
    button.replaceWith(mark);
    drawn = shown.map((incident) => `${incident.id}|${acked.has(incident.id)}`).join('\n');
    console.info('acked-on-board', reply.id);
  } catch (error) {
    button.disabled = false;
    console.error(error);
  }
});

await refresh();
setInterval(refresh, 2000);
