import Link from "next/link";
import { ArrowLeft, Mail, Send, CheckCheck, Eye, MousePointerClick, ShieldBan, TriangleAlert, MessageSquareWarning, RotateCcw } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import styles from "./email-operations.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DeliveryEvent = {
  id: string;
  event_type: string;
  resend_email_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  event_created_at: string | null;
  received_at: string;
};
type Suppression = { email: string; reason: string; source_event_type: string | null; suppressed_at: string };

const EVENT_LABELS: Record<string, string> = {
  "email.sent": "Sent", "email.delivered": "Delivered", "email.delivery_delayed": "Delayed",
  "email.bounced": "Bounced", "email.failed": "Failed", "email.suppressed": "Suppressed",
  "email.complained": "Complained", "email.opened": "Opened", "email.clicked": "Clicked",
};
const FILTER_EVENTS = ["all", ...Object.keys(EVENT_LABELS)];

function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(date);
}
function pct(value: number): string { return `${Math.round(value * 10) / 10}%`; }
const METRIC_ICONS = { Sent: Send, Delivered: CheckCheck, Opened: Eye, Clicked: MousePointerClick, Suppressed: ShieldBan, Bounced: RotateCcw, Failed: TriangleAlert, Complaints: MessageSquareWarning };
function metricCard(label: keyof typeof METRIC_ICONS, value: string | number, description: string, tone = "neutral") {
  const Icon = METRIC_ICONS[label];
  return <article className={`${styles.metric} ${styles[tone] ?? ""}`} aria-label={label}>
    <div className={styles.metricTop}><p>{label}</p><span className={styles.metricIcon}><Icon size={17} aria-hidden="true" /></span></div>
    <strong className={styles.metricValue}>{typeof value === "number" ? value.toLocaleString("en-ZA") : value}</strong>
    <p className={styles.metricDescription}>{description}</p>
  </article>;
}

export default async function EmailOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const daysRaw = Number(one(params.days) || "30");
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const eventFilter = FILTER_EVENTS.includes(one(params.event)) ? one(params.event) : "all";
  const query = one(params.q).trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return <main className={styles.page}><div className={styles.notice} role="alert">Email data is unavailable. Please try again later.</div></main>;

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const [eventsResult, suppressionsResult] = await Promise.all([
    admin.from("email_delivery_events").select("id,event_type,resend_email_id,recipient_email,subject,event_created_at,received_at").gte("received_at", sinceIso).order("received_at", { ascending: false }).limit(1000),
    admin.from("email_suppressions").select("email,reason,source_event_type,suppressed_at").order("suppressed_at", { ascending: false }).limit(500),
  ]);
  const allEvents = (eventsResult.data ?? []) as DeliveryEvent[];
  const suppressions = (suppressionsResult.data ?? []) as Suppression[];
  const error = eventsResult.error?.message ?? suppressionsResult.error?.message ?? null;
  const count = (type: string) => allEvents.filter((event) => event.event_type === type).length;
  const sent = count("email.sent"), delivered = count("email.delivered"), bounced = count("email.bounced"), failed = count("email.failed"), complained = count("email.complained"), opened = count("email.opened"), clicked = count("email.clicked");
  const deliveryRate = sent ? (delivered / sent) * 100 : 0;
  const openRate = delivered ? (opened / delivered) * 100 : 0;
  const clickRate = delivered ? (clicked / delivered) * 100 : 0;
  const filteredEvents = allEvents.filter((event) => {
    if (eventFilter !== "all" && event.event_type !== eventFilter) return false;
    if (!query) return true;
    return `${event.recipient_email ?? ""} ${event.subject ?? ""} ${event.resend_email_id ?? ""}`.toLowerCase().includes(query);
  }).slice(0, 250);

  const daily = new Map<string, { sent: number; delivered: number; opened: number; bounced: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - i);
    daily.set(d.toISOString().slice(0,10), { sent: 0, delivered: 0, opened: 0, bounced: 0 });
  }
  for (const event of allEvents) {
    const key = (event.event_created_at ?? event.received_at).slice(0,10);
    const row = daily.get(key); if (!row) continue;
    if (event.event_type === "email.sent") row.sent++;
    if (event.event_type === "email.delivered") row.delivered++;
    if (event.event_type === "email.opened") row.opened++;
    if (event.event_type === "email.bounced") row.bounced++;
  }
  const trend = [...daily.entries()];
  const maxTrend = Math.max(1, ...trend.flatMap(([, r]) => [r.sent, r.delivered, r.opened, r.bounced]));

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroTop}><Link href="/office/marketing/email" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Email campaigns</Link><Link href="/office" className={styles.brandPlate} aria-label="Shalean office dashboard"><ShaleanNavLogo className={styles.logo} intrinsicHeight={40} /></Link></div>
      <div className={styles.heroContent}>
        <div><p className={styles.eyebrow}><Mail size={16} aria-hidden="true" /> Shalean Office</p><h1>Email Management</h1><p className={styles.subtitle}>Delivery, engagement and blocked addresses.</p></div>
        <span className={styles.timezone}>South Africa time</span>
      </div>
    </header>
    {error ? <div className={styles.notice} role="alert">Some email data could not be loaded: {error}</div> : null}

    <form className={styles.filters} method="get">
      <label>Date range<select name="days" defaultValue={String(days)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
      <label>Event type<select name="event" defaultValue={eventFilter}>{FILTER_EVENTS.map(value => <option key={value} value={value}>{value === "all" ? "All events" : EVENT_LABELS[value]}</option>)}</select></label>
      <label className={styles.search}>Search<input name="q" defaultValue={one(params.q)} placeholder="Recipient, subject or Resend ID" /></label>
      <div className={styles.filterActions}><button type="submit" className={styles.primaryButton}>Apply</button><Link href="/office/email-operations" className={styles.secondaryButton}><RotateCcw size={14} aria-hidden="true" />Reset</Link></div>
    </form>

    <section className={styles.metrics} aria-label="Email overview">
      {metricCard("Sent", sent, `Last ${days} days`)}
      {metricCard("Delivered", delivered, `${pct(deliveryRate)} delivery rate`, "success")}
      {metricCard("Opened", opened, `${pct(openRate)} open rate`)}
      {metricCard("Clicked", clicked, `${pct(clickRate)} click-through rate`)}
      {metricCard("Suppressed", suppressions.length, "Blocked locally")}
      {metricCard("Bounced", bounced, "Rejected by recipient", bounced ? "alert" : "neutral")}
      {metricCard("Failed", failed, "Delivery failures", failed ? "alert" : "neutral")}
      {metricCard("Complaints", complained, "Spam reports", complained ? "alert" : "neutral")}
    </section>

    <section className={styles.card} aria-labelledby="delivery-trend-title">
      <div className={styles.sectionHeader}><div><h2 id="delivery-trend-title">Delivery trend</h2><p>Daily activity · last {days} days</p></div>
        <ul className={styles.legend} aria-label="Chart legend"><li className={styles.sent}>Sent</li><li className={styles.delivered}>Delivered</li><li className={styles.opened}>Opened</li><li className={styles.bounced}>Bounced</li></ul>
      </div>
      <div className={styles.chartScroll} tabIndex={0} role="region" aria-label="Daily email chart; scroll horizontally to view all days">
        <div className={styles.chart} style={{ minWidth: Math.max(600, days * 25) }}>
          {trend.map(([date, row]) => <div key={date} className={styles.day}>
            <div className={styles.bars}>
              <div title={`Sent ${row.sent}`} className={`${styles.bar} ${styles.sent}`} style={{ height: `${Math.max(row.sent ? 4 : 0, (row.sent / maxTrend) * 100)}%` }} />
              <div title={`Delivered ${row.delivered}`} className={`${styles.bar} ${styles.delivered}`} style={{ height: `${Math.max(row.delivered ? 4 : 0, (row.delivered / maxTrend) * 100)}%` }} />
              <div title={`Opened ${row.opened}`} className={`${styles.bar} ${styles.opened}`} style={{ height: `${Math.max(row.opened ? 4 : 0, (row.opened / maxTrend) * 100)}%` }} />
              <div title={`Bounced ${row.bounced}`} className={`${styles.bar} ${styles.bounced}`} style={{ height: `${Math.max(row.bounced ? 4 : 0, (row.bounced / maxTrend) * 100)}%` }} />
            </div><span>{date.slice(5)}</span>
          </div>)}
        </div>
      </div>
    </section>

    <section className={styles.card} aria-labelledby="delivery-events-title">
      <div className={styles.sectionHeader}><h2 id="delivery-events-title">Delivery events</h2><span className={styles.count}>{filteredEvents.length} results</span></div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Delivery events table">
        <table className={styles.table}><thead><tr><th scope="col">Status</th><th scope="col">Recipient</th><th scope="col">Subject</th><th scope="col">Resend ID</th><th scope="col">Time (SAST)</th></tr></thead><tbody>
          {filteredEvents.length ? filteredEvents.map(event => <tr key={event.id}>
            <td><span className={`${styles.badge} ${event.event_type === "email.delivered" ? styles.badgeSuccess : ["email.bounced", "email.failed", "email.complained", "email.suppressed"].includes(event.event_type) ? styles.badgeAlert : styles.badgeInfo}`}>{EVENT_LABELS[event.event_type] ?? event.event_type}</span></td>
            <td className={styles.recipient}>{event.recipient_email ?? "—"}</td><td className={styles.subject}>{event.subject ?? "—"}</td>
            <td className={styles.messageId}>{event.resend_email_id ?? "—"}</td><td className={styles.date}>{formatDate(event.event_created_at ?? event.received_at)}</td>
          </tr>) : <tr><td colSpan={5} className={styles.empty}>No events match your filters.</td></tr>}
        </tbody></table>
      </div>
    </section>

    <section className={styles.card} aria-labelledby="suppression-title">
      <div className={styles.sectionHeader}><div><h2 id="suppression-title">Suppression list</h2><p>Blocked email addresses</p></div><span className={styles.count}>{suppressions.length} blocked</span></div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Suppression list table">
        <table className={styles.table}><thead><tr><th scope="col">Email</th><th scope="col">Reason</th><th scope="col">Source</th><th scope="col">Suppressed (SAST)</th></tr></thead><tbody>
          {suppressions.length ? suppressions.slice(0,100).map(row => <tr key={row.email}><td className={styles.recipient}>{row.email}</td><td>{row.reason}</td><td>{row.source_event_type ?? "Manual"}</td><td className={styles.date}>{formatDate(row.suppressed_at)}</td></tr>) : <tr><td colSpan={4} className={styles.empty}><ShieldBan size={21} aria-hidden="true" /><p>No blocked addresses.</p></td></tr>}
        </tbody></table>
      </div>
    </section>
  </main>;
}
