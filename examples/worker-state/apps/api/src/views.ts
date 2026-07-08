const BASE_STYLES = `
  :root {
    color-scheme: dark;
    --void: #08080e;
    --surface-0: rgba(14, 14, 22, 0.92);
    --surface-1: rgba(21, 21, 34, 0.96);
    --surface-2: rgba(28, 28, 46, 0.98);
    --surface-3: rgba(38, 38, 58, 0.98);
    --border: rgba(75, 75, 112, 0.5);
    --border-subtle: rgba(52, 52, 77, 0.55);
    --text: #e8e8f4;
    --text-muted: #9a9ab2;
    --text-dim: #5b5b77;
    --green: #34d399;
    --green-dim: rgba(6, 95, 70, 0.44);
    --amber: #fbbf24;
    --amber-dim: rgba(120, 53, 15, 0.44);
    --cyan: #22d3ee;
    --cyan-dim: rgba(22, 78, 99, 0.44);
    --red: #f87171;
    --red-dim: rgba(127, 29, 29, 0.44);
    --purple: #a78bfa;
    --purple-dim: rgba(76, 29, 149, 0.42);
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    --font-display: "Syne", "Avenir Next", "Segoe UI", sans-serif;
    --font-mono: "DM Mono", "SFMono-Regular", "Monaco", monospace;
  }

  * {
    box-sizing: border-box;
  }

  html {
    background: var(--void);
    color: var(--text);
  }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--text);
    font-family: var(--font-mono);
    background:
      radial-gradient(circle at top, rgba(167, 139, 250, 0.12), transparent 28%),
      radial-gradient(circle at right, rgba(34, 211, 238, 0.08), transparent 24%),
      var(--void);
    background-image:
      radial-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
      radial-gradient(circle at top, rgba(167, 139, 250, 0.12), transparent 28%),
      radial-gradient(circle at right, rgba(34, 211, 238, 0.08), transparent 24%),
      linear-gradient(180deg, rgba(8, 8, 14, 1) 0%, rgba(12, 12, 20, 1) 100%);
    background-size: 24px 24px, auto, auto, auto;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    border: 0;
    cursor: pointer;
  }

  .shell {
    width: min(1240px, calc(100vw - 32px));
    margin: 24px auto 40px;
  }

  .topbar {
    position: sticky;
    top: 16px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid var(--border);
    background: rgba(14, 14, 22, 0.82);
    backdrop-filter: blur(18px);
    box-shadow: var(--shadow);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(167, 139, 250, 0.28);
    background: rgba(167, 139, 250, 0.12);
    color: var(--purple);
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  h1,
  h2,
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  h1 {
    font-size: clamp(22px, 3vw, 28px);
  }

  h2 {
    font-size: 20px;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    background: rgba(21, 21, 34, 0.92);
    color: var(--text-muted);
    font-size: 12px;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }

  .chip:hover,
  .chip.active {
    background: rgba(167, 139, 250, 0.14);
    border-color: rgba(167, 139, 250, 0.36);
    color: var(--text);
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-top: 18px;
  }

  .panel {
    border: 1px solid var(--border);
    background: var(--surface-1);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .panel-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .panel-meta {
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .hero-grid,
  .support-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 18px;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
    gap: 18px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .guide {
    padding: 18px;
  }

  .guide-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .guide-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .guide-bullet {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border: 1px solid rgba(167, 139, 250, 0.3);
    background: rgba(167, 139, 250, 0.12);
    color: var(--purple);
    font-size: 11px;
  }

  .guide-item strong {
    display: block;
    margin-bottom: 4px;
    color: var(--text);
    font-size: 13px;
  }

  .muted {
    color: var(--text-muted);
    line-height: 1.6;
    font-size: 13px;
  }

  .task-form {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--surface-0);
    color: var(--text);
    padding: 12px 14px;
  }

  textarea {
    min-height: 112px;
    resize: vertical;
    line-height: 1.5;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: rgba(167, 139, 250, 0.48);
    box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.18);
  }

  .mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .mode-card {
    display: block;
  }

  .toggle-field {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .toggle-field input {
    margin-top: 4px;
    width: 16px;
    height: 16px;
    accent-color: var(--purple);
  }

  .mode-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .mode-card-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 104px;
    padding: 14px;
    border: 1px solid var(--border);
    background: var(--surface-0);
    transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
  }

  .mode-card:hover .mode-card-copy {
    transform: translateY(-1px);
    border-color: rgba(167, 139, 250, 0.28);
  }

  .mode-card input:checked + .mode-card-copy {
    border-color: rgba(167, 139, 250, 0.44);
    background: rgba(167, 139, 250, 0.12);
  }

  .mode-title {
    font-family: var(--font-display);
    font-size: 15px;
    color: var(--text);
  }

  .mode-description {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .button-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .button-note {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.5;
  }

  .button-primary,
  .button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid transparent;
    transition: transform 120ms ease, opacity 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  .button-primary {
    background: linear-gradient(135deg, rgba(167, 139, 250, 0.95), rgba(34, 211, 238, 0.95));
    color: #0b0b11;
    font-weight: 700;
  }

  .button-secondary {
    background: rgba(21, 21, 34, 0.96);
    border-color: var(--border);
    color: var(--text);
  }

  .button-primary:hover,
  .button-secondary:hover {
    transform: translateY(-1px);
  }

  .button-primary:disabled,
  .button-secondary:disabled {
    opacity: 0.55;
    transform: none;
    cursor: not-allowed;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }

  .stat-card {
    padding: 14px;
    border: 1px solid var(--border);
    border-left: 2px solid var(--text-dim);
    background: var(--surface-1);
  }

  .stat-card .label {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .stat-card .value {
    font-family: var(--font-display);
    font-size: 24px;
    color: var(--text);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }

  th,
  td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: top;
    text-align: left;
    font-size: 12px;
  }

  th {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-weight: 500;
  }

  tbody tr:hover {
    background: rgba(167, 139, 250, 0.05);
  }

  .table-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .table-title strong {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--text);
  }

  .table-detail {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status-badge::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--text-dim);
  }

  .status-badge.queued,
  .status-badge.redrive_requested {
    color: var(--green);
    border-color: rgba(52, 211, 153, 0.22);
    background: var(--green-dim);
  }

  .status-badge.queued::before,
  .status-badge.redrive_requested::before {
    background: var(--green);
  }

  .status-badge.running,
  .status-badge.retry_scheduled,
  .status-badge.failed {
    color: var(--amber);
    border-color: rgba(251, 191, 36, 0.22);
    background: var(--amber-dim);
  }

  .status-badge.running::before,
  .status-badge.retry_scheduled::before,
  .status-badge.failed::before {
    background: var(--amber);
  }

  .status-badge.succeeded {
    color: var(--cyan);
    border-color: rgba(34, 211, 238, 0.22);
    background: var(--cyan-dim);
  }

  .status-badge.succeeded::before {
    background: var(--cyan);
  }

  .status-badge.dead_letter,
  .status-badge.enqueue_failed {
    color: var(--red);
    border-color: rgba(248, 113, 113, 0.22);
    background: var(--red-dim);
  }

  .status-badge.dead_letter::before,
  .status-badge.enqueue_failed::before {
    background: var(--red);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid rgba(167, 139, 250, 0.26);
    background: rgba(167, 139, 250, 0.12);
    color: var(--purple);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .empty-state {
    padding: 24px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .activity-log {
    max-height: 420px;
    overflow-y: auto;
  }

  .activity-row {
    display: grid;
    grid-template-columns: 58px 16px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
    align-items: start;
  }

  .activity-time {
    color: var(--text-dim);
    font-size: 11px;
    tab-size: 2;
  }

  .activity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: 11px;
    font-weight: 700;
  }

  .activity-icon.submitted { color: var(--green); }
  .activity-icon.running,
  .activity-icon.retry,
  .activity-icon.failed { color: var(--amber); }
  .activity-icon.completed { color: var(--cyan); }
  .activity-icon.dead_letter,
  .activity-icon.enqueue_failed { color: var(--red); }
  .activity-icon.redrive_requested { color: var(--purple); }

  .activity-copy strong {
    display: block;
    color: var(--text);
    font-size: 13px;
    margin-bottom: 4px;
  }

  .infra-list {
    display: flex;
    flex-direction: column;
  }

  .infra-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .infra-row:last-child {
    border-bottom: 0;
  }

  .infra-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .infra-dot.green { background: var(--green); }
  .infra-dot.amber { background: var(--amber); }
  .infra-dot.cyan { background: var(--cyan); }
  .infra-dot.red { background: var(--red); }

  .infra-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .infra-copy strong {
    color: var(--text);
    font-size: 13px;
  }

  .dead-letter-list,
  .job-preview-list {
    display: flex;
    flex-direction: column;
  }

  .dead-letter-card,
  .job-preview-row {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dead-letter-card:last-child,
  .job-preview-row:last-child {
    border-bottom: 0;
  }

  .dead-letter-header,
  .job-preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dead-letter-reason {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
  }

  .inline-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .code {
    font-family: var(--font-mono);
    color: var(--text-muted);
    font-size: 11px;
  }

  .alert {
    padding: 14px 16px;
    border: 1px solid rgba(248, 113, 113, 0.26);
    background: rgba(127, 29, 29, 0.24);
    color: var(--red);
    font-size: 13px;
  }

  .ops-grid {
    display: grid;
    gap: 18px;
  }

  .filter-grid,
  .insight-grid {
    display: grid;
    gap: 12px;
    padding: 18px;
  }

  .filter-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .insight-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filter-chip-row,
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 18px 18px;
  }

  .hero-note,
  .query-banner {
    margin: 0 18px 18px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    background: rgba(21, 21, 34, 0.92);
  }

  .query-banner {
    font-size: 12px;
    color: var(--text-muted);
  }

  .signal-list {
    display: flex;
    flex-direction: column;
  }

  .signal-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .signal-row:last-child {
    border-bottom: 0;
  }

  .signal-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .signal-copy strong {
    color: var(--text);
    font-size: 13px;
  }

  .signal-value {
    flex-shrink: 0;
    color: var(--cyan);
    font-family: var(--font-display);
    font-size: 20px;
  }

  .metric-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 18px;
  }

  .metric-tile {
    padding: 14px;
    border: 1px solid var(--border);
    background: var(--surface-0);
  }

  .metric-tile .label {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .metric-tile .value {
    color: var(--text);
    font-family: var(--font-display);
    font-size: 22px;
  }

  .table-caption {
    padding: 0 16px 14px;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.6;
  }

  @media (max-width: 1120px) {
    .hero-grid,
    .dashboard-grid,
    .support-grid {
      grid-template-columns: 1fr;
    }

    .filter-grid,
    .insight-grid,
    .metric-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stats-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .shell {
      width: min(100vw, calc(100vw - 20px));
      margin: 10px auto 28px;
    }

    .topbar {
      position: static;
      padding: 14px;
      flex-direction: column;
      align-items: stretch;
    }

    .nav-links {
      flex-wrap: wrap;
    }

    .mode-grid,
    .filter-grid,
    .insight-grid,
    .metric-strip,
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .button-row {
      flex-direction: column;
      align-items: stretch;
    }

    .activity-row {
      grid-template-columns: 48px 16px minmax(0, 1fr);
    }
  }
`;

function renderTopbar(activePage: "dashboard" | "demo") {
  return `
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">qs</span>
          <div>
            <div class="eyebrow">Alt Stack Example</div>
            <h1>Task Queue State</h1>
          </div>
        </div>
        <nav class="nav-links">
          <a class="chip ${activePage === "dashboard" ? "active" : ""}" href="/dashboard">Dashboard</a>
          <a class="chip ${activePage === "demo" ? "active" : ""}" href="/demo">Demo</a>
        </nav>
      </header>
  `;
}

export function renderProductionDashboardPage(): string {
  const fleetStats = [
    { label: "Active Jobs", value: "18.4k" },
    { label: "Retry Pressure", value: "3.8%" },
    { label: "DLQ Rate", value: "0.42%" },
    { label: "Redrive Exhaustion", value: "27" },
    { label: "Regions At Risk", value: "2 / 6" },
    { label: "Affected Customers", value: "11" },
  ];
  const queueHealthRows = [
    {
      region: "iad",
      queue: "billing.invoice-rebuild",
      customerSlice: "enterprise",
      active: "1,284",
      retry: "4.1%",
      dlq: "9",
      oldest: "42s",
      note: "Post-deploy retry storm on one task type",
    },
    {
      region: "dub",
      queue: "support.ticket-enrichment",
      customerSlice: "all",
      active: "742",
      retry: "1.3%",
      dlq: "2",
      oldest: "18s",
      note: "Healthy queue with low lag",
    },
    {
      region: "pdx",
      queue: "identity.profile-sync",
      customerSlice: "consumer",
      active: "2,106",
      retry: "6.7%",
      dlq: "14",
      oldest: "91s",
      note: "Regional dependency causing backoff growth",
    },
    {
      region: "syd",
      queue: "risk.decision-redrive",
      customerSlice: "regulated",
      active: "316",
      retry: "0.8%",
      dlq: "0",
      oldest: "11s",
      note: "Low volume, stable latency",
    },
  ];
  const hotspotRows = [
    {
      customer: "Acme Financial",
      userSlice: "svc-billing-prod",
      queue: "billing.invoice-rebuild",
      taskType: "invoice_pdf_render",
      states: "retry_scheduled, dead_letter",
      impact: "9 DLQ / 61 retries",
    },
    {
      customer: "Northwind Health",
      userSlice: "svc-risk-prod",
      queue: "risk.decision-redrive",
      taskType: "eligibility_replay",
      states: "failed",
      impact: "12 exhausted redrives",
    },
    {
      customer: "Globex Retail",
      userSlice: "ops-import",
      queue: "identity.profile-sync",
      taskType: "profile_merge",
      states: "running, retry_scheduled",
      impact: "P95 age 109s",
    },
    {
      customer: "Umbra Logistics",
      userSlice: "svc-support-eu",
      queue: "support.ticket-enrichment",
      taskType: "summary_generation",
      states: "succeeded",
      impact: "Healthy after retry spike",
    },
  ];
  const savedViews = [
    {
      name: "EU DLQ burn",
      detail: "region in (dub, fra) • state = dead_letter • customer_tier = enterprise",
      count: "14 queues",
    },
    {
      name: "Retry storm after deploy",
      detail: "updated_at last 30m • retry_count >= 1 • deploy_sha = current",
      count: "3 hotspots",
    },
    {
      name: "Redrive exhaustion",
      detail: "state = failed • redrive_count >= redrive_budget",
      count: "27 jobs",
    },
    {
      name: "High-value customer risk",
      detail: "customer_segment = strategic • state in (retry_scheduled, dead_letter)",
      count: "11 customers",
    },
  ];
  const drilldowns = [
    {
      name: "Slice by queue family",
      detail: "Group queue names into billing, support, identity, risk, and dispatch families to spot shared failures faster.",
      value: "queue_name prefix",
    },
    {
      name: "Slice by customer and user",
      detail: "Track which customers, tenants, service accounts, or operators are creating retries or exhausting redrives.",
      value: "customer_id, user_id",
    },
    {
      name: "Slice by task type",
      detail: "Separate ingestion, enrichment, replay, export, and remediation tasks so one noisy workflow does not hide another.",
      value: "job_name, task_type",
    },
    {
      name: "Slice by execution policy",
      detail: "Filter by retry budget, retry backoff, and redrive budget to compare how policy choices change fleet behavior.",
      value: "retry/redrive config",
    },
    {
      name: "Slice by geography",
      detail: "Compare regions and clusters to isolate transport lag, DLQ burn, or cross-region recovery issues.",
      value: "region, cluster",
    },
    {
      name: "Slice by customer impact",
      detail: "Surface the highest-value or highest-affected cohorts before drilling down into individual jobs.",
      value: "customer_tier, volume",
    },
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Task Queue State Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@500;700;800&display=swap" rel="stylesheet" />
    <style>${BASE_STYLES}</style>
  </head>
  <body>
    <div class="shell">
      ${renderTopbar("dashboard")}

      <main class="page">
        <section class="hero-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Production Dashboard</div>
                <h2>How the queue-state model scales beyond one demo queue</h2>
              </div>
            </div>
            <div class="guide">
              <ol class="guide-list">
                <li class="guide-item">
                  <span class="guide-bullet">1</span>
                  <div class="muted">
                    <strong>Start at fleet health</strong>
                    Watch active load, retry pressure, dead-letter rate, and redrive exhaustion across every queue family before you drill into a single job.
                  </div>
                </li>
                <li class="guide-item">
                  <span class="guide-bullet">2</span>
                  <div class="muted">
                    <strong>Slice by region, customer, user, and task type</strong>
                    The same state model can be filtered by geography, tenant, operator, retry policy, and task class so hotspots stay attributable.
                  </div>
                </li>
                <li class="guide-item">
                  <span class="guide-bullet">3</span>
                  <div class="muted">
                    <strong>Use the demo for real interactions</strong>
                    This page is illustrative only. The runnable queue, task submission flow, and live redrive controls still live on <a class="chip" href="/demo">/demo</a>.
                  </div>
                </li>
              </ol>
            </div>
          </article>

          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Filter Surface</div>
                <h2>Representative slicing controls</h2>
              </div>
              <span class="panel-meta">Illustrative only</span>
            </div>
            <div class="filter-grid">
              <div class="field">
                <label class="field-label" for="obs-window">Time window</label>
                <select id="obs-window">
                  <option>Last 15 minutes</option>
                  <option>Last hour</option>
                  <option>Last 24 hours</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-region">Region</label>
                <select id="obs-region">
                  <option>IAD + DUB + PDX</option>
                  <option>All regions</option>
                  <option>EU only</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-queue">Queue family</label>
                <select id="obs-queue">
                  <option>Billing + Risk</option>
                  <option>All queues</option>
                  <option>Support only</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-state">State slice</label>
                <select id="obs-state">
                  <option>retry_scheduled + dead_letter</option>
                  <option>running only</option>
                  <option>failed only</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-customer">Customer cohort</label>
                <select id="obs-customer">
                  <option>Enterprise + strategic</option>
                  <option>All customers</option>
                  <option>Free tier</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-user">User / actor</label>
                <select id="obs-user">
                  <option>svc-billing-prod + ops-import</option>
                  <option>All actors</option>
                  <option>Human operators only</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-task-type">Task type</label>
                <select id="obs-task-type">
                  <option>invoice_pdf_render + eligibility_replay</option>
                  <option>All task types</option>
                  <option>Exports only</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="obs-policy">Execution policy</label>
                <select id="obs-policy">
                  <option>retry budget ≥ 1 • redrive budget finite</option>
                  <option>Unlimited redrives</option>
                  <option>Static backoff only</option>
                </select>
              </div>
            </div>
            <div class="query-banner">
              Applied slice: <span class="code">window = 15m</span> • <span class="code">regions = iad,dub,pdx</span> • <span class="code">states = retry_scheduled,dead_letter</span> • <span class="code">customers = enterprise,strategic</span> • <span class="code">task_types = invoice_pdf_render,eligibility_replay</span>
            </div>
            <div class="filter-chip-row">
              <span class="pill">Queue depth</span>
              <span class="pill">Retry burn</span>
              <span class="pill">DLQ rate</span>
              <span class="pill">Redrive exhaustion</span>
              <span class="pill">Oldest active age</span>
              <span class="pill">Customer blast radius</span>
            </div>
          </article>
        </section>

        <section class="stats-grid">
          ${fleetStats.map((stat) => `
            <article class="stat-card">
              <div class="label">${stat.label}</div>
              <div class="value">${stat.value}</div>
            </article>
          `).join("")}
        </section>

        <section class="dashboard-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Fleet Overview</div>
                <h2>Regional queue health</h2>
              </div>
              <span class="panel-meta">group by region + queue</span>
            </div>
            <div class="table-caption">
              This is the first cut a production team would use to rank hotspots before drilling into a customer, task type, or one affected service account.
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Queue</th>
                    <th>Customer Slice</th>
                    <th>Active</th>
                    <th>Retry</th>
                    <th>DLQ</th>
                    <th>Oldest</th>
                    <th>Why it matters</th>
                  </tr>
                </thead>
                <tbody>
                  ${queueHealthRows.map((row) => `
                    <tr>
                      <td><span class="pill">${row.region}</span></td>
                      <td><div class="table-title"><strong>${row.queue}</strong></div></td>
                      <td>${row.customerSlice}</td>
                      <td>${row.active}</td>
                      <td>${row.retry}</td>
                      <td>${row.dlq}</td>
                      <td>${row.oldest}</td>
                      <td class="table-detail">${row.note}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </article>

          <div class="stack">
            <article class="panel">
              <div class="panel-header">
                <div class="panel-copy">
                  <div class="eyebrow">Saved Views</div>
                  <h2>Operational slices teams would keep on hand</h2>
                </div>
              </div>
              <div class="signal-list">
                ${savedViews.map((view) => `
                  <div class="signal-row">
                    <div class="signal-copy">
                      <strong>${view.name}</strong>
                      <div class="muted">${view.detail}</div>
                    </div>
                    <div class="signal-value">${view.count}</div>
                  </div>
                `).join("")}
              </div>
            </article>

            <article class="panel">
              <div class="panel-header">
                <div class="panel-copy">
                  <div class="eyebrow">Alert Lenses</div>
                  <h2>What the state model should aggregate</h2>
                </div>
              </div>
              <div class="metric-strip">
                <div class="metric-tile">
                  <div class="label">DLQ Lens</div>
                  <div class="value">queue × region × customer</div>
                </div>
                <div class="metric-tile">
                  <div class="label">Retry Lens</div>
                  <div class="value">task type × backoff policy</div>
                </div>
                <div class="metric-tile">
                  <div class="label">Redrive Lens</div>
                  <div class="value">budget exhaustion × owner</div>
                </div>
              </div>
              <div class="legend-row">
                <span class="pill">oldest running age</span>
                <span class="pill">retry count burn</span>
                <span class="pill">manual redrive volume</span>
                <span class="pill">terminal failure rate</span>
              </div>
            </article>
          </div>
        </section>

        <section class="support-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Hotspot Drilldown</div>
                <h2>Customer, user, and task-type impact</h2>
              </div>
              <span class="panel-meta">group by tenant + actor + job</span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>User / Actor</th>
                    <th>Queue</th>
                    <th>Task Type</th>
                    <th>States</th>
                    <th>Impact</th>
                  </tr>
                </thead>
                <tbody>
                  ${hotspotRows.map((row) => `
                    <tr>
                      <td><div class="table-title"><strong>${row.customer}</strong></div></td>
                      <td class="code">${row.userSlice}</td>
                      <td>${row.queue}</td>
                      <td>${row.taskType}</td>
                      <td><span class="pill">${row.states}</span></td>
                      <td class="table-detail">${row.impact}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </article>

          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">State Model Surfaces</div>
                <h2>Dimensions this dashboard would expose</h2>
              </div>
              <span class="panel-meta">illustrative slices</span>
            </div>
            <div class="insight-grid">
              ${drilldowns.map((item) => `
                <article class="metric-tile">
                  <div class="label">${item.value}</div>
                  <div class="value">${item.name}</div>
                  <div class="muted">${item.detail}</div>
                </article>
              `).join("")}
            </div>
            <div class="hero-note muted">
              The demo route shows one queue and one task form. A production surface built on the same queue-state snapshots would aggregate by <code class="code">queue_name</code>, <code class="code">region</code>, <code class="code">job_name</code>, <code class="code">customer_id</code>, <code class="code">user_id</code>, and the snapshotted retry/redrive policy so operators can move from fleet risk to one failing cohort without losing context.
            </div>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

export function renderTaskDemoPage(options: {
  defaultRetryBudget: number;
  defaultRetryBackoffType: "static" | "linear" | "exponential";
  defaultRetryBackoffStartingSeconds: number;
  defaultRedriveBudget?: number;
} = {
  defaultRetryBudget: 0,
  defaultRetryBackoffType: "static",
  defaultRetryBackoffStartingSeconds: 0,
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Task Queue State Demo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@500;700;800&display=swap" rel="stylesheet" />
    <style>${BASE_STYLES}</style>
  </head>
  <body>
    <div class="shell">
      ${renderTopbar("demo")}

      <main class="page">
        <div id="alert" class="alert" hidden></div>

        <section class="hero-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">How To Demo</div>
                <h2>Queue tasks, then break them on purpose</h2>
              </div>
            </div>
            <div class="guide">
              <ol class="guide-list">
                <li class="guide-item">
                  <span class="guide-bullet">1</span>
                  <div class="muted">
                    <strong>Queue a normal task</strong>
                    Submit a success task and watch it settle into <code class="code">succeeded</code>.
                  </div>
                </li>
                <li class="guide-item">
                  <span class="guide-bullet">2</span>
                  <div class="muted">
                    <strong>Trigger a retry</strong>
                    Set <code class="code">fail after retries</code> to <code class="code">1</code> and keep a retry budget above zero so the dispatcher can send the next retry-cycle attempt.
                  </div>
                </li>
                <li class="guide-item">
                  <span class="guide-bullet">3</span>
                  <div class="muted">
                    <strong>Exercise redrive budgets</strong>
                    Turn on <code class="code">always fail</code>, then redrive the task until it either stays dead-lettered or exhausts its configured budget.
                  </div>
                </li>
              </ol>
            </div>
          </article>

          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Queue A Task</div>
                <h2>Submit work into Kafka</h2>
              </div>
              <span class="panel-meta">ClickHouse stores queue state</span>
            </div>

            <form id="task-form" class="task-form">
              <div class="field">
                <label class="field-label" for="task-title">Task title</label>
                <input id="task-title" name="title" placeholder="Generate invoice export" maxlength="120" required />
              </div>

              <div class="field">
                <label class="field-label" for="task-description">Task details</label>
                <textarea id="task-description" name="description" placeholder="Describe the work payload or downstream context."></textarea>
              </div>

              <div class="field">
                <label class="field-label" for="task-fail-after-retries">Fail after retries</label>
                <input
                  id="task-fail-after-retries"
                  name="failAfterRetries"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  value="0"
                />
                <div class="muted">Use <code class="code">0</code> for success only. Use <code class="code">1</code> to fail once before succeeding on the first retry.</div>
              </div>

              <div class="field">
                <label class="toggle-field" for="task-always-fail">
                  <input id="task-always-fail" name="alwaysFail" type="checkbox" />
                  <span class="mode-card-copy">
                    <span class="mode-title">Always fail</span>
                    <span class="mode-description">Ignore the fail-after-retries value and keep failing until the task lands in dead letter or exhausts its redrive budget.</span>
                  </span>
                </label>
              </div>

              <div class="field">
                <label class="field-label" for="task-retry-budget">Retry budget</label>
                <input
                  id="task-retry-budget"
                  name="retryBudget"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="Default ${options.defaultRetryBudget}"
                />
                <div class="muted">Leave blank to use the queue default (${options.defaultRetryBudget}).</div>
              </div>

              <div class="field">
                <label class="field-label" for="task-retry-backoff-type">Retry backoff</label>
                <select id="task-retry-backoff-type" name="retryBackoffType">
                  <option value="">Use default (${options.defaultRetryBackoffType})</option>
                  <option value="static">Static</option>
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                </select>
                <div class="muted">Static waits the same amount each time. Linear and exponential grow from the starting seconds value.</div>
              </div>

              <div class="field">
                <label class="field-label" for="task-retry-backoff-starting-seconds">Retry backoff starting seconds</label>
                <input
                  id="task-retry-backoff-starting-seconds"
                  name="retryBackoffStartingSeconds"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="Default ${options.defaultRetryBackoffStartingSeconds}"
                />
                <div class="muted">Leave blank to use the queue default (${options.defaultRetryBackoffStartingSeconds}s).</div>
              </div>

              <div class="field">
                <label class="field-label" for="task-redrive-budget">Redrive budget</label>
                <input
                  id="task-redrive-budget"
                  name="redriveBudget"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="${options.defaultRedriveBudget === undefined
                    ? "Use queue default"
                    : `Default ${options.defaultRedriveBudget}`}"
                  value="${options.defaultRedriveBudget ?? ""}"
                />
                <div class="muted">
                  Leave blank to use the default${options.defaultRedriveBudget === undefined
                    ? " (unlimited in this build)."
                    : ` (${options.defaultRedriveBudget}).`}.
                </div>
              </div>

              <div class="button-row">
                <div class="button-note">The task record stores its effective retry and redrive config in SQLite. Queue-state transitions live in ClickHouse.</div>
                <button id="submit-task" class="button-primary" type="submit">Queue task</button>
              </div>
            </form>
          </article>
        </section>

        <section id="stats" class="stats-grid"></section>

        <section class="dashboard-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Live Queue</div>
                <h2>Recent Tasks</h2>
              </div>
              <span id="task-count" class="panel-meta">0 tasks</span>
            </div>
            <div id="tasks-table"></div>
          </article>

          <div class="stack">
            <article class="panel">
              <div class="panel-header">
                <div class="panel-copy">
                  <div class="eyebrow">Realtime Feed</div>
                  <h2>Activity Log</h2>
                </div>
              </div>
              <div id="activity-log"></div>
            </article>

            <article class="panel">
              <div class="panel-header">
                <div class="panel-copy">
                  <div class="eyebrow">Infra</div>
                  <h2>Runtime Surface</h2>
                </div>
              </div>
              <div id="infrastructure-panel"></div>
            </article>
          </div>
        </section>

        <section class="support-grid">
          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Dead Letter Queue</div>
                <h2>Tasks needing attention</h2>
              </div>
            </div>
            <div id="dead-letter-preview"></div>
          </article>

          <article class="panel">
            <div class="panel-header">
              <div class="panel-copy">
                <div class="eyebrow">Recent Jobs</div>
                <h2>Queue state snapshots</h2>
              </div>
            </div>
            <div id="jobs-preview"></div>
          </article>
        </section>
      </main>
    </div>

    <script type="module">
      const DEFAULT_RETRY_BUDGET = ${options.defaultRetryBudget};
      const DEFAULT_RETRY_BACKOFF_TYPE = "${options.defaultRetryBackoffType}";
      const DEFAULT_RETRY_BACKOFF_STARTING_SECONDS = ${options.defaultRetryBackoffStartingSeconds};
      const DEFAULT_REDRIVE_BUDGET = ${options.defaultRedriveBudget ?? "null"};
      const REFRESH_MS = 1800;
      const state = {
        pollHandle: null,
      };

      const elements = {
        alert: document.querySelector("#alert"),
        stats: document.querySelector("#stats"),
        taskCount: document.querySelector("#task-count"),
        tasksTable: document.querySelector("#tasks-table"),
        activityLog: document.querySelector("#activity-log"),
        infrastructure: document.querySelector("#infrastructure-panel"),
        deadLetters: document.querySelector("#dead-letter-preview"),
        jobsPreview: document.querySelector("#jobs-preview"),
        taskForm: document.querySelector("#task-form"),
        submitTask: document.querySelector("#submit-task"),
        taskTitle: document.querySelector("#task-title"),
        taskDescription: document.querySelector("#task-description"),
        taskFailAfterRetries: document.querySelector("#task-fail-after-retries"),
        taskAlwaysFail: document.querySelector("#task-always-fail"),
        taskRetryBudget: document.querySelector("#task-retry-budget"),
        taskRetryBackoffType: document.querySelector("#task-retry-backoff-type"),
        taskRetryBackoffStartingSeconds: document.querySelector("#task-retry-backoff-starting-seconds"),
        taskRedriveBudget: document.querySelector("#task-redrive-budget"),
      };

      function showError(message) {
        elements.alert.hidden = false;
        elements.alert.textContent = message;
      }

      function clearError() {
        elements.alert.hidden = true;
        elements.alert.textContent = "";
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }

      function formatState(value) {
        return value.replaceAll("_", " ");
      }

      function formatFailureBehavior(task) {
        if (task.alwaysFail) {
          return "always fail";
        }

        if (task.failAfterRetries === 0) {
          return "success only";
        }

        return task.failAfterRetries === 1
          ? "fail after 1 retry"
          : \`fail after \${task.failAfterRetries} retries\`;
      }

      function formatRedriveUsage(redriveCount, redriveBudget) {
        if (redriveBudget === null || redriveBudget === undefined) {
          return \`\${redriveCount} used / unlimited\`;
        }

        return \`\${redriveCount}/\${redriveBudget} used\`;
      }

      function formatRetryUsage(retryCount, retryBudget) {
        return \`\${retryCount}/\${retryBudget} used\`;
      }

      function formatRetryBackoff(type, startingSeconds) {
        return \`\${type} @ \${startingSeconds}s\`;
      }

      function formatRedriveRemaining(redriveRemaining) {
        if (redriveRemaining === null || redriveRemaining === undefined) {
          return "Unlimited left";
        }

        return \`\${redriveRemaining} left\`;
      }

      function formatAge(timestamp) {
        const diff = Date.now() - Date.parse(timestamp);
        if (!Number.isFinite(diff) || diff < 1000) return "<1s";
        if (diff < 60_000) return \`\${Math.floor(diff / 1000)}s\`;
        if (diff < 3_600_000) return \`\${Math.floor(diff / 60_000)}m\`;
        if (diff < 86_400_000) return \`\${Math.floor(diff / 3_600_000)}h\`;
        return \`\${Math.floor(diff / 86_400_000)}d\`;
      }

      function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }

      function summarizeText(value, maxLength = 96) {
        if (!value) return "";
        const compact = String(value).replace(/\\s+/g, " ").trim();
        if (compact.length <= maxLength) return compact;
        return \`\${compact.slice(0, maxLength - 3)}...\`;
      }

      async function fetchJson(path, options) {
        const response = await fetch(path, options);
        const payload = await response.json().catch(() => undefined);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Request failed");
        }
        return payload;
      }

      function renderStats(stats) {
        const cards = [
          { label: "Total", value: stats.total, color: "var(--text)", borderColor: "var(--text-dim)" },
          { label: "Queued", value: stats.queued, color: "var(--green)", borderColor: "var(--green)" },
          { label: "Running", value: stats.running, color: "var(--amber)", borderColor: "var(--amber)" },
          { label: "Retrying", value: stats.retryScheduled, color: "var(--amber)", borderColor: "var(--amber)" },
          { label: "Succeeded", value: stats.succeeded, color: "var(--cyan)", borderColor: "var(--cyan)" },
          { label: "Dead Letter", value: stats.deadLetter, color: "var(--red)", borderColor: "var(--red)" },
          { label: "Failed", value: stats.failed + stats.enqueueFailed, color: "var(--purple)", borderColor: "var(--purple)" },
        ];

        elements.stats.innerHTML = cards
          .map((card) => \`
            <article class="stat-card" style="border-left-color:\${card.borderColor};">
              <div class="label">\${escapeHtml(card.label)}</div>
              <div class="value" style="color:\${card.color};">\${escapeHtml(card.value)}</div>
            </article>
          \`)
          .join("");
      }

      function renderTasks(tasks) {
        elements.taskCount.textContent = \`\${tasks.length} task\${tasks.length === 1 ? "" : "s"}\`;

        if (!tasks.length) {
          elements.tasksTable.innerHTML = '<div class="empty-state">No tasks queued yet. Submit one above to start the flow.</div>';
          return;
        }

        const rows = tasks.map((task) => {
          const description = task.description
            ? \`<div class="table-detail">\${escapeHtml(summarizeText(task.description, 120))}</div>\`
            : "";
          const outcome = task.state === "dead_letter"
            ? task.deadLetterReason?.message ?? "Moved to dead letter"
            : task.state === "failed"
            ? task.redriveBudget === null
              ? "Processing failed"
              : \`Redrive budget exhausted after \${formatRedriveUsage(task.redriveCount, task.redriveBudget)}\`
            : task.enqueueError ?? task.result ?? "Waiting for worker output";

          return \`
            <tr>
              <td><span class="status-badge \${escapeHtml(task.state)}">\${escapeHtml(formatState(task.state))}</span></td>
              <td>
                <div class="table-title">
                  <strong>\${escapeHtml(task.title)}</strong>
                  \${description}
                </div>
              </td>
              <td><span class="pill">\${escapeHtml(formatFailureBehavior(task))}</span></td>
              <td>\${escapeHtml(task.attempt ?? "n/a")}</td>
              <td>\${escapeHtml(formatRetryUsage(task.retryCount, task.retryBudget))}<div class="table-detail">\${escapeHtml(formatRetryBackoff(task.retryBackoffType, task.retryBackoffStartingSeconds))}</div></td>
              <td>\${escapeHtml(formatRedriveUsage(task.redriveCount, task.redriveBudget))}</td>
              <td>\${escapeHtml(formatAge(task.updatedAtFromQueue ?? task.updatedAt))}</td>
              <td class="table-detail">\${escapeHtml(summarizeText(outcome, 110))}</td>
            </tr>
          \`;
        }).join("");

        elements.tasksTable.innerHTML = \`
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th>Task</th>
                  <th>Behavior</th>
                  <th>Attempt</th>
                  <th>Retry</th>
                  <th>Redrives</th>
                  <th>Age</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>\${rows}</tbody>
            </table>
          </div>
        \`;
      }

      function renderActivity(activity) {
        if (!activity.length) {
          elements.activityLog.innerHTML = '<div class="empty-state">Waiting for queue activity...</div>';
          return;
        }

        const icons = {
          submitted: "+",
          running: ">",
          retry: "!",
          completed: "*",
          dead_letter: "x",
          failed: "x",
          redrive_requested: "r",
          enqueue_failed: "x",
        };

        elements.activityLog.innerHTML = \`
          <div class="activity-log">
            \${activity.map((event) => \`
              <div class="activity-row">
                <div class="activity-time">\${escapeHtml(formatTime(event.timestamp))}</div>
                <div class="activity-icon \${escapeHtml(event.type)}">\${escapeHtml(icons[event.type] ?? ".")}</div>
                <div class="activity-copy">
                  <strong>\${escapeHtml(event.label)}</strong>
                  <div class="muted">\${escapeHtml(event.detail)}</div>
                </div>
              </div>
            \`).join("")}
          </div>
        \`;
      }

      function renderInfrastructure(data) {
        const rows = [
          {
            dot: "green",
            title: "Kafka transport",
            detail: "Topic task-queue-example-jobs is carrying queue traffic for this demo.",
          },
          {
            dot: data.stats.running > 0 || data.stats.retryScheduled > 0 ? "amber" : "cyan",
            title: "Worker + dispatcher",
            detail: \`\${data.stats.running} running, \${data.stats.retryScheduled} waiting for retry delivery.\`,
          },
          {
            dot: data.stats.deadLetter + data.stats.failed + data.stats.enqueueFailed > 0 ? "red" : "green",
            title: "Failure surface",
            detail: \`\${data.stats.deadLetter} dead-lettered, \${data.stats.failed} terminal failures, \${data.stats.enqueueFailed} enqueue failures.\`,
          },
          {
            dot: data.redrives.length > 0 ? "purple" : "cyan",
            title: "Redrive history",
            detail: \`\${data.redrives.length} recent redrive request\${data.redrives.length === 1 ? "" : "s"}.\`,
          },
        ];

        elements.infrastructure.innerHTML = \`
          <div class="infra-list">
            \${rows.map((row) => \`
              <div class="infra-row">
                <span class="infra-dot \${escapeHtml(row.dot)}"></span>
                <div class="infra-copy">
                  <strong>\${escapeHtml(row.title)}</strong>
                  <div class="muted">\${escapeHtml(row.detail)}</div>
                </div>
              </div>
            \`).join("")}
          </div>
        \`;
      }

      function renderDeadLetters(deadLetters) {
        if (!deadLetters.length) {
          elements.deadLetters.innerHTML = '<div class="empty-state">No dead-lettered tasks right now.</div>';
          return;
        }

        elements.deadLetters.innerHTML = \`
          <div class="dead-letter-list">
            \${deadLetters.map((task) => \`
              <article class="dead-letter-card">
                <div class="dead-letter-header">
                  <div class="table-title">
                    <strong>\${escapeHtml(task.title)}</strong>
                    <div class="inline-meta">
                      <span class="status-badge \${escapeHtml(task.state)}">\${escapeHtml(formatState(task.state))}</span>
                  <span class="pill">\${escapeHtml(formatFailureBehavior(task))}</span>
                      <span class="pill">\${escapeHtml(formatRetryUsage(task.retryCount, task.retryBudget))}</span>
                      <span class="pill">\${escapeHtml(formatRedriveUsage(task.redriveCount, task.redriveBudget))}</span>
                    </div>
                  </div>
                  \${task.canRedrive
                    ? \`<button class="button-secondary" data-redrive="\${escapeHtml(task.jobId)}">Redrive</button>\`
                    : \`<span class="pill">\${escapeHtml(formatRedriveRemaining(task.redriveRemaining))}</span>\`}
                </div>
                <div class="dead-letter-reason">\${escapeHtml(task.deadLetterReason?.message ?? "Moved to dead letter")}</div>
                <div class="inline-meta">
                  <span>Attempt \${escapeHtml(task.attempt ?? "n/a")}</span>
                  <span>\${escapeHtml(formatRetryBackoff(task.retryBackoffType, task.retryBackoffStartingSeconds))}</span>
                  <span>\${escapeHtml(formatRedriveRemaining(task.redriveRemaining))}</span>
                  <span class="code">\${escapeHtml(task.jobId)}</span>
                </div>
              </article>
            \`).join("")}
          </div>
        \`;

        elements.deadLetters.querySelectorAll("[data-redrive]").forEach((node) => {
          node.addEventListener("click", async () => {
            try {
              clearError();
              await redrive(node.getAttribute("data-redrive"));
            } catch (error) {
              showError(error.message);
            }
          });
        });
      }

      function renderJobsPreview(jobs) {
        if (!jobs.length) {
          elements.jobsPreview.innerHTML = '<div class="empty-state">No jobs observed yet.</div>';
          return;
        }

        elements.jobsPreview.innerHTML = \`
          <div class="job-preview-list">
            \${jobs.slice(0, 8).map((job) => \`
              <article class="job-preview-row">
                <div class="job-preview-header">
                  <div class="table-title">
                    <strong>\${escapeHtml(job.title)}</strong>
                    <div class="inline-meta">
                      <span class="status-badge \${escapeHtml(job.state)}">\${escapeHtml(formatState(job.state))}</span>
                      <span>Attempt \${escapeHtml(job.attempt ?? "n/a")}</span>
                      <span>\${escapeHtml(formatRetryUsage(job.retryCount, job.retryBudget))}</span>
                      <span>\${escapeHtml(formatRedriveUsage(job.redriveCount, job.redriveBudget))}</span>
                    </div>
                  </div>
                  <span class="code">\${escapeHtml(job.jobId.slice(0, 12))}</span>
                </div>
                <div class="muted">\${escapeHtml(summarizeText(job.result ?? job.enqueueError ?? job.description ?? "No additional details", 120))}</div>
              </article>
            \`).join("")}
          </div>
        \`;
      }

      async function redrive(jobId) {
        await fetchJson(\`/api/ops/jobs/\${jobId}/redrive\`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Manual redrive from dashboard" }),
        });

        await loadDashboard();
      }

      async function queueTask(payload) {
        await fetchJson("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      async function loadDashboard() {
        const data = await fetchJson("/api/dashboard");
        renderStats(data.stats);
        renderTasks(data.tasks);
        renderActivity(data.activity);
        renderInfrastructure(data);
        renderDeadLetters(data.deadLetters);
        renderJobsPreview(data.jobs);
      }

      elements.taskForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(elements.taskForm);
        const retryBudgetValue = String(formData.get("retryBudget") ?? "").trim();
        const retryBackoffTypeValue = String(formData.get("retryBackoffType") ?? "").trim();
        const retryBackoffStartingSecondsValue = String(
          formData.get("retryBackoffStartingSeconds") ?? "",
        ).trim();
        const redriveBudgetValue = String(formData.get("redriveBudget") ?? "").trim();
        const payload = {
          title: String(formData.get("title") ?? "").trim(),
          description: String(formData.get("description") ?? "").trim(),
          failAfterRetries: Number(String(formData.get("failAfterRetries") ?? "0").trim() || "0"),
          alwaysFail: formData.get("alwaysFail") === "on",
        };
        const config = {};
        if (
          retryBudgetValue !== ""
          || retryBackoffTypeValue !== ""
          || retryBackoffStartingSecondsValue !== ""
        ) {
          config.retry = {};
          if (retryBudgetValue !== "") {
            config.retry.budget = Number(retryBudgetValue);
          }
          if (retryBackoffTypeValue !== "" || retryBackoffStartingSecondsValue !== "") {
            config.retry.backoff = {};
            if (retryBackoffTypeValue !== "") {
              config.retry.backoff.type = retryBackoffTypeValue;
            }
            if (retryBackoffStartingSecondsValue !== "") {
              config.retry.backoff.startingSeconds = Number(retryBackoffStartingSecondsValue);
            }
          }
        }
        if (redriveBudgetValue !== "") {
          config.redrive = {
            budget: Number(redriveBudgetValue),
          };
        }
        if (Object.keys(config).length > 0) {
          payload.config = config;
        }

        try {
          clearError();
          elements.submitTask.disabled = true;
          await queueTask(payload);
          elements.taskForm.reset();
          elements.taskTitle.value = "";
          elements.taskDescription.value = "";
          elements.taskFailAfterRetries.value = "0";
          elements.taskAlwaysFail.checked = false;
          elements.taskRetryBudget.value = "";
          elements.taskRetryBackoffType.value = "";
          elements.taskRetryBackoffStartingSeconds.value = "";
          elements.taskRedriveBudget.value = "";
          await loadDashboard();
        } catch (error) {
          showError(error.message);
          await loadDashboard().catch(() => undefined);
        } finally {
          elements.submitTask.disabled = false;
        }
      });

      async function boot() {
        try {
          await loadDashboard();
        } catch (error) {
          showError(error.message);
        }

        state.pollHandle = setInterval(() => {
          void loadDashboard().catch(() => undefined);
        }, REFRESH_MS);
      }

      boot();
    </script>
  </body>
</html>`;
}
