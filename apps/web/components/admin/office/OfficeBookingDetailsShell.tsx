"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Flag,
  Home,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  RotateCcw,
  Send,
  ShieldAlert,
  TriangleAlert,
  User,
  UserCheck,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { AdminWarningList } from "@/components/admin/AdminWarningList";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";
import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import { AdminBookingLiveLocation } from "@/components/admin/AdminBookingLiveLocation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OfficeTimelineStep = {
  label: string;
  done: boolean;
  active?: boolean;
  time: string;
  hint?: string;
};

export type OfficeBookingDetailsShellProps = {
  basePath: string;
  onBack: () => void;
  bookingRef: string;
  createdLabel: string;
  bookingId: string;
  paymentStatusLabel: string;
  paymentStatusShort: string;
  canMarkPaid: boolean;
  serviceName: string;
  serviceSummaryLine: string | null;
  scheduleDateLabel: string;
  scheduleTimeLabel: string;
  scheduleRelativeShort: string | null;
  startsInIsPast: boolean;
  locationPrimary: string;
  locationSecondary: string;
  locationRaw: string | null;
  cleanerEntityLabel: string;
  cleanerDisplayName: string | null;
  cleanerStatusLabel: string;
  cleanerRatingLine: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerMissingPhone: boolean;
  userId: string | null;
  total: number;
  basePrice: number;
  extrasPrice: number;
  durationLabel: string;
  bedrooms: string;
  bathrooms: string;
  statusSteps: OfficeTimelineStep[];
  flags: string[];
  snapshotNotesText: string | null;
  notesCreatedLabel: string | null;
  cleanerIssueCount: number;
  dispatchOfferCount: number;
  notificationLogCount: number;
  notificationLogsLoading: boolean;
  adminActionWarnings: AdminWarning[];
  needsDispatchAttention: boolean;
  dispatchCaption: string;
  showAdminMarkComplete: boolean;
  showAdminMarkCancel: boolean;
  markPaidBusy: boolean;
  fixEarningsBusy: boolean;
  resetEarningsBusy: boolean;
  statusBusy: "completed" | "cancelled" | null;
  resetDispatchBusy: boolean;
  editBookingBlockedReason: string | null;
  resetEarningsBlockedReason: string | null;
  editDetailsBusy: boolean;
  savingSchedule: boolean;
  editingSchedule: boolean;
  draftDate: string;
  draftTime: string;
  zohoInvoiceId: string | null;
  cleanerTotalZar: number | null;
  companyRevenueZar: number | null;
  existingDepositLabel: string | null;
  operationalPhase: BookingOperationalPhase;
  assignedCleanerId: string | null;
  supportsTeamAssignment: boolean;
  isTeamAssigned: boolean;
  onAssignPrimary: () => void;
  onEditBooking: () => void;
  onReschedule: () => void;
  onContactCustomer: () => void;
  onMarkPaid: () => void;
  onFixEarnings: () => void;
  onResetEarnings: () => void;
  onMarkComplete: () => void;
  onCancel: () => void;
  onAssignManually: () => void;
  onResetDispatch: () => void;
  onEditSchedule: () => void;
  onCancelEditSchedule: () => void;
  onSaveSchedule: () => void;
  onDraftDateChange: (v: string) => void;
  onDraftTimeChange: (v: string) => void;
  onViewCleanerProfile: () => void;
  overviewExtras: ReactNode;
  overviewIssues: ReactNode;
  overviewDispatch: ReactNode;
  overviewNotifications: ReactNode;
  tabCustomer: ReactNode;
  tabService: ReactNode;
  tabSchedule: ReactNode;
  tabCleaner: ReactNode;
  tabPayments: ReactNode;
  tabNotifications: ReactNode;
  tabActivity: ReactNode;
};

const SUMMARY_META_CLASS =
  "mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case leading-none whitespace-nowrap";

const OFFICE_TABS = [
  ["overview", "Overview"],
  ["customer", "Customer"],
  ["service", "Service details"],
  ["schedule", "Schedule"],
  ["cleaner", "Cleaner / Team"],
  ["payments", "Payments"],
  ["notifications", "Notifications"],
  ["activity", "Activity"],
] as const;

export function OfficeBookingDetailsShell(props: OfficeBookingDetailsShellProps) {
  const paymentBadgeVariant = props.canMarkPaid ? "warning" : "success";
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-5">
      {props.adminActionWarnings.length > 0 ? <AdminWarningList warnings={props.adminActionWarnings} /> : null}

      {props.needsDispatchAttention ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Dispatch needs attention</p>
                <p className="text-sm">{props.dispatchCaption || "Review assignment and dispatch status."}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={props.onAssignManually}>
                Assign manually
              </Button>
              <Button size="sm" variant="outline" disabled={props.resetDispatchBusy} onClick={props.onResetDispatch} className="bg-white">
                {props.resetDispatchBusy ? "Resetting..." : "Reset dispatch"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Page header */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={props.onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Booking {props.bookingRef}</h1>
          <Badge variant={paymentBadgeVariant} className="normal-case whitespace-nowrap">
            {props.paymentStatusLabel}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">
          Created on {props.createdLabel} · Booking ID: <span className="font-mono text-xs">{props.bookingId}</span>
        </p>
      </div>

      {/* Summary bar */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="grid gap-0 p-0 md:grid-cols-2 xl:grid-cols-5">
          <SummaryTile icon={Home} label="Service" primary={props.serviceName} secondary={props.serviceSummaryLine} />
          <SummaryTile
            icon={Calendar}
            label="Schedule"
            primary={props.scheduleDateLabel}
            secondary={props.scheduleTimeLabel}
            meta={
              props.scheduleRelativeShort ? (
                <span
                  className={[
                    SUMMARY_META_CLASS,
                    props.startsInIsPast ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
                  ].join(" ")}
                >
                  {props.startsInIsPast ? props.scheduleRelativeShort : `Starts in ${props.scheduleRelativeShort.replace(/^In /, "")}`}
                </span>
              ) : null
            }
          />
          <SummaryTile
            icon={MapPin}
            label="Location"
            primary={props.locationPrimary}
            secondary={props.locationSecondary}
            meta={
              props.locationRaw ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.locationRaw)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${SUMMARY_META_CLASS} bg-blue-50 text-blue-700 hover:underline`}
                >
                  Open in maps <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              ) : null
            }
          />
          <SummaryTile
            label={props.cleanerEntityLabel}
            avatar={<AvatarFallback>{initials(props.cleanerDisplayName ?? "OS")}</AvatarFallback>}
            avatarInIconSlot
            primary={props.cleanerDisplayName ?? "Unassigned"}
            secondary={props.cleanerRatingLine}
            meta={
              <span
                className={[
                  SUMMARY_META_CLASS,
                  props.cleanerStatusLabel === "Assigned" || props.cleanerStatusLabel === "Available"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800",
                ].join(" ")}
              >
                {props.cleanerStatusLabel}
              </span>
            }
          />
          <SummaryTile
            icon={CreditCard}
            label="Payment"
            meta={
              <span
                className={[
                  SUMMARY_META_CLASS,
                  paymentBadgeVariant === "warning" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700",
                ].join(" ")}
              >
                {props.canMarkPaid ? props.paymentStatusLabel : "Paid"}
              </span>
            }
            primary={<span className="text-xl font-bold text-slate-950">R {props.total.toLocaleString("en-ZA")}</span>}
          />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b border-slate-200 bg-transparent p-0">
          {OFFICE_TABS.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none sm:px-4"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
          <TabsContent value="overview" className="mt-0 space-y-5">
            <div className="grid gap-5 md:grid-cols-2 md:items-start">
              <AdminInfoCard title="Booking status" icon={BadgeCheck} footer={<Button variant="ghost" size="sm" className="text-blue-700" onClick={() => setActiveTab("activity")}>View full timeline</Button>}>
                <div className="space-y-0">
                  {props.statusSteps.map((step, index) => (
                    <TimelineStep key={step.label} step={step} isLast={index === props.statusSteps.length - 1} />
                  ))}
                </div>
              </AdminInfoCard>

              <div className="flex min-w-0 flex-col gap-5">
                <AdminInfoCard title="Customer" icon={User} footer={<Button variant="outline" size="sm" onClick={() => setActiveTab("customer")}>View customer profile</Button>}>
                  <div className="flex items-start gap-3">
                    <Avatar className="shrink-0">
                      <AvatarFallback>{initials(props.customerName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-950">{props.customerName}</p>
                      <p className="break-all text-sm text-slate-500">{props.customerEmail}</p>
                    </div>
                  </div>
                  <InfoRow label="Phone" value={props.customerPhone} />
                  <InfoRow label="User ID" value={props.userId ?? "—"} mono />
                </AdminInfoCard>

                <AdminInfoCard
                  title={props.cleanerEntityLabel}
                  headerAvatar={<AvatarFallback>{initials(props.cleanerDisplayName ?? "OS")}</AvatarFallback>}
                  footer={
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("cleaner")}>
                      View cleaner profile
                    </Button>
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-950">{props.cleanerDisplayName ?? "Unassigned"}</p>
                      {props.cleanerRatingLine ? <p className="text-sm text-slate-500">{props.cleanerRatingLine}</p> : null}
                    </div>
                    <Badge variant={props.cleanerStatusLabel === "Assigned" || props.cleanerStatusLabel === "Available" ? "success" : "warning"} className="shrink-0 normal-case">
                      {props.cleanerStatusLabel}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <InfoRow label="Status" value={props.cleanerStatusLabel} />
                  </div>
                </AdminInfoCard>
              </div>
            </div>

            <AdminInfoCard
              title="Service & pricing"
              icon={ReceiptText}
              footer={<Button variant="ghost" size="sm" className="text-blue-700" onClick={() => setActiveTab("service")}>View full pricing</Button>}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <ServiceDetail label="Service type" value={props.serviceName} />
                  <ServiceDetail label="Bedrooms" value={props.bedrooms} />
                  <ServiceDetail label="Bathrooms" value={props.bathrooms} />
                  <ServiceDetail label="Duration" value={props.durationLabel} />
                </div>
                <div className="w-full shrink-0 rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:w-52 sm:p-3.5 lg:w-56">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Total (visit)</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700 sm:text-2xl">R {props.total.toLocaleString("en-ZA")}</p>
                  <p className="mt-1 text-xs leading-snug text-emerald-800">
                    Base R {props.basePrice.toLocaleString("en-ZA")} · Extras R {props.extrasPrice.toLocaleString("en-ZA")}
                  </p>
                </div>
              </div>
              {props.overviewExtras}
            </AdminInfoCard>

            <div className="grid gap-5 md:grid-cols-2 md:items-start">
              <AdminInfoCard title="Schedule" icon={Clock} footer={<Button variant="outline" size="sm" onClick={props.onEditSchedule}><Pencil className="mr-1 h-3.5 w-3.5" />Edit schedule</Button>}>
                {props.editingSchedule ? (
                  <ScheduleEditor
                    draftDate={props.draftDate}
                    draftTime={props.draftTime}
                    saving={props.savingSchedule}
                    onDateChange={props.onDraftDateChange}
                    onTimeChange={props.onDraftTimeChange}
                    onCancel={props.onCancelEditSchedule}
                    onSave={props.onSaveSchedule}
                  />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3 sm:items-start">
                    <MiniMetric label="Date" value={props.scheduleDateLabel} />
                    <MiniMetric label="Time" value={props.scheduleTimeLabel} />
                    <MiniMetric label="Duration" value={props.durationLabel} />
                  </div>
                )}
              </AdminInfoCard>

              <AdminInfoCard title="Location" icon={MapPin} footer={
                props.locationRaw ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.locationRaw)}`} target="_blank" rel="noreferrer">
                      <MapPin className="mr-1 h-3.5 w-3.5" />Open in maps
                    </a>
                  </Button>
                ) : undefined
              }>
                <p className="break-words font-semibold text-slate-950">{props.locationPrimary}</p>
                <p className="break-words text-sm text-slate-500">{props.locationSecondary}</p>
              </AdminInfoCard>
            </div>

            <div className="grid gap-5 md:grid-cols-2 md:items-start">
              <AdminInfoCard
                title="Notification timeline"
                icon={Mail}
                footer={
                  <Link href="/office/notification-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                    View full logs <ExternalLink className="h-3 w-3" />
                  </Link>
                }
              >
                {props.notificationLogsLoading ? (
                  <EmptyState>Loading...</EmptyState>
                ) : props.notificationLogCount === 0 ? (
                  <EmptyState>No outbound logs yet</EmptyState>
                ) : (
                  props.overviewNotifications
                )}
              </AdminInfoCard>

              <AdminInfoCard
                title="Booking notes"
                icon={FileText}
                footer={
                  props.notesCreatedLabel ? (
                    <p className="text-xs text-slate-400">
                      Added on {props.notesCreatedLabel}
                      <button type="button" className="ml-2 font-semibold text-blue-700 hover:underline" onClick={props.onEditBooking}>
                        Edit note
                      </button>
                    </p>
                  ) : undefined
                }
              >
                {props.snapshotNotesText ? (
                  <p className="whitespace-pre-wrap break-words rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                    {props.snapshotNotesText}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">No booking notes recorded.</p>
                )}
              </AdminInfoCard>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 items-start xl:grid-cols-3">
              <AdminInfoCard title="Flags" icon={Flag}>
                <div className="flex flex-wrap gap-2">
                  {props.flags.length ? (
                    props.flags.map((flag) => (
                      <span key={flag} className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
                        {flag}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> No issues
                    </span>
                  )}
                </div>
              </AdminInfoCard>
              <AdminInfoCard title="Cleaner-reported issues" icon={ShieldAlert}>
                {props.cleanerIssueCount === 0 ? <EmptyState>No issues reported</EmptyState> : props.overviewIssues}
              </AdminInfoCard>
              <AdminInfoCard title="Dispatch offers" icon={Send}>
                {props.dispatchOfferCount === 0 ? <EmptyState>No dispatch offers for this booking</EmptyState> : props.overviewDispatch}
              </AdminInfoCard>
            </div>

            <AdminBookingLiveLocation
              bookingId={props.bookingId}
              operationalPhase={props.operationalPhase}
              cleanerId={props.assignedCleanerId}
            />
          </TabsContent>

          <TabsContent value="customer" className="mt-0">{props.tabCustomer}</TabsContent>
          <TabsContent value="service" className="mt-0">{props.tabService}</TabsContent>
          <TabsContent value="schedule" className="mt-0">{props.tabSchedule}</TabsContent>
          <TabsContent value="cleaner" className="mt-0">{props.tabCleaner}</TabsContent>
          <TabsContent value="payments" className="mt-0">{props.tabPayments}</TabsContent>
          <TabsContent value="notifications" className="mt-0">{props.tabNotifications}</TabsContent>
          <TabsContent value="activity" className="mt-0">{props.tabActivity}</TabsContent>
          </div>

          <ActionsPanel {...props} />
        </div>
      </Tabs>
    </div>
  );
}

function ActionsPanel(props: OfficeBookingDetailsShellProps) {
  const assignLabel = props.supportsTeamAssignment
    ? props.isTeamAssigned
      ? "Reassign team"
      : "Assign team"
    : props.cleanerDisplayName
      ? "Reassign cleaner"
      : "Assign cleaner";

  return (
    <aside className="xl:sticky xl:top-20 xl:self-start">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={props.onAssignPrimary}>
            <UserCheck className="h-4 w-4" />
            {assignLabel}
          </Button>

          <ActionGroup title="Booking">
            <Button variant="outline" className="w-full justify-start" onClick={props.onEditBooking} disabled={Boolean(props.editBookingBlockedReason) || props.editDetailsBusy}>
              <Pencil className="h-4 w-4" /> Edit booking
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={props.onReschedule}>
              <Calendar className="h-4 w-4" /> Reschedule
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={props.onContactCustomer}>
              <Phone className="h-4 w-4" /> Contact customer
            </Button>
          </ActionGroup>

          <ActionGroup title="Payment">
            <Button
              variant="outline"
              className="w-full justify-start border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              disabled={!props.canMarkPaid || props.markPaidBusy}
              onClick={props.onMarkPaid}
            >
              <Wallet className="h-4 w-4" /> Mark as Paid
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled={props.fixEarningsBusy} onClick={props.onFixEarnings}>
              {props.fixEarningsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Fix earnings
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              disabled={Boolean(props.resetEarningsBlockedReason) || props.resetEarningsBusy}
              onClick={props.onResetEarnings}
            >
              <RotateCcw className="h-4 w-4" /> Reset & recompute
            </Button>
          </ActionGroup>

          {props.showAdminMarkComplete ? (
            <Button
              variant="outline"
              className="w-full justify-start border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              disabled={props.statusBusy !== null}
              onClick={props.onMarkComplete}
            >
              {props.statusBusy === "completed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark as completed
            </Button>
          ) : props.canMarkPaid ? (
            <p className="text-xs leading-relaxed text-slate-500">Mark as completed is available after payment is recorded.</p>
          ) : null}

          {props.showAdminMarkCancel ? (
            <ActionGroup title="Danger zone">
              <Button variant="destructive" className="w-full justify-start bg-red-600 hover:bg-red-700" disabled={props.statusBusy !== null} onClick={props.onCancel}>
                {props.statusBusy === "cancelled" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel booking
              </Button>
            </ActionGroup>
          ) : null}

          {props.zohoInvoiceId ? (
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href={`/api/admin/bookings/${encodeURIComponent(props.bookingId)}/invoice-pdf`} target="_blank" rel="noopener noreferrer">
                <ReceiptText className="h-4 w-4" /> View invoice
              </a>
            </Button>
          ) : null}

          <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-sm">
            <p className="font-semibold text-slate-800">Payment snapshot</p>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <p>Total visit: R {props.total.toLocaleString("en-ZA")}</p>
              <p>Cleaner earnings: {props.cleanerTotalZar == null ? "Pending" : `R ${props.cleanerTotalZar.toLocaleString("en-ZA")}`}</p>
              <p>Company revenue: {props.companyRevenueZar == null ? "Pending" : `R ${props.companyRevenueZar.toLocaleString("en-ZA")}`}</p>
              {props.existingDepositLabel ? <p>Deposit: {props.existingDepositLabel}</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  primary,
  secondary,
  meta,
  avatar,
  avatarInIconSlot = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  avatar?: ReactNode;
  avatarInIconSlot?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-slate-100 px-4 py-3.5 last:border-b-0 md:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="flex items-start gap-3">
        {avatarInIconSlot && avatar ? (
          <Avatar className="h-9 w-9 shrink-0">{avatar}</Avatar>
        ) : Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="mt-0.5 text-sm font-semibold text-slate-950">{primary}</div>
          {secondary ? <p className="truncate text-xs text-slate-500">{secondary}</p> : null}
          {meta}
        </div>
      </div>
    </div>
  );
}

function AdminInfoCard({
  title,
  icon: Icon,
  headerAvatar,
  children,
  footer,
  className,
  contentClassName,
  footerClassName,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  headerAvatar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
}) {
  return (
    <Card className={["w-full min-w-0 self-start rounded-2xl border-slate-200 shadow-sm", className].filter(Boolean).join(" ")}>
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-3">
        {headerAvatar ? (
          <Avatar className="h-8 w-8 shrink-0">{headerAvatar}</Avatar>
        ) : Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <CardTitle className="min-w-0 text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className={["min-w-0 space-y-3 px-4 pt-0 pb-4", contentClassName].filter(Boolean).join(" ")}>{children}</CardContent>
      {footer ? (
        <CardFooter className={["flex-wrap items-center gap-2 border-t border-slate-100 px-4 pt-3 pb-4", footerClassName].filter(Boolean).join(" ")}>{footer}</CardFooter>
      ) : null}
    </Card>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,5.5rem)_1fr] sm:items-start sm:gap-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={[
          "min-w-0 break-words font-medium text-slate-900 sm:text-right",
          mono ? "break-all font-mono text-[11px] leading-snug" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function ServiceDetail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-0.5 break-words font-medium text-slate-900">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 self-start rounded-xl bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-xs font-semibold leading-snug text-slate-900">{value}</p>
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function TimelineStep({ step, isLast }: { step: OfficeTimelineStep; isLast: boolean }) {
  const dotClass = step.done
    ? "bg-emerald-500 text-white"
    : step.active
      ? "bg-amber-100 text-amber-600 ring-2 ring-amber-300"
      : "bg-slate-200 text-slate-400";

  return (
    <div className="grid grid-cols-[1.25rem_1fr] gap-3">
      <div className="flex flex-col items-center">
        <span className={["mt-0.5 flex h-5 w-5 items-center justify-center rounded-full", dotClass].join(" ")}>
          {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
        </span>
        {!isLast ? <span className={["h-10 w-px", step.done ? "bg-emerald-200" : "bg-slate-200"].join(" ")} /> : null}
      </div>
      <div className="pb-4">
        <p className="text-sm font-semibold text-slate-900">{step.label}</p>
        <p className="text-xs text-slate-500">{step.hint ?? step.time}</p>
      </div>
    </div>
  );
}

function ScheduleEditor({
  draftDate,
  draftTime,
  saving,
  onDateChange,
  onTimeChange,
  onCancel,
  onSave,
}: {
  draftDate: string;
  draftTime: string;
  saving: boolean;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-500">
          Date
          <input type="date" value={draftDate} onChange={(e) => onDateChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Time
          <input type="time" value={draftTime} onChange={(e) => onTimeChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={saving} onClick={onSave}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      </div>
    </div>
  );
}

function initials(value: string): string {
  const parts = value.replace(/@.*/, "").split(/\s+|[._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "AD";
}
