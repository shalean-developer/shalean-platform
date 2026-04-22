"use client";

import {
  BadgeAlert,
  Calendar,
  Check,
  CircleDollarSign,
  Copy,
  Eye,
  FileText,
  MoreHorizontal,
  NotebookPen,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useInteractions,
  useClick,
  useDismiss,
  useRole,
} from "@floating-ui/react";
import { useEffect, useState, type ReactNode } from "react";

type BookingActionsDropdownProps<TBooking> = {
  booking: TBooking;
  onAssign?: (booking: TBooking) => void;
  onReschedule?: (booking: TBooking) => void;
  onComplete?: (booking: TBooking) => void;
  onCancel?: (booking: TBooking) => void;
  onView?: (booking: TBooking) => void;
  onReassign?: (booking: TBooking) => void;
  onRefund?: (booking: TBooking) => void;
  onDuplicateBooking?: (booking: TBooking) => void;
  onSendInvoice?: (booking: TBooking) => void;
  onAddNote?: (booking: TBooking) => void;
  onFlagIssue?: (booking: TBooking) => void;
};

export default function BookingActionsDropdown<TBooking>({
  booking,
  onAssign,
  onReschedule,
  onComplete,
  onCancel,
  onView,
  onReassign,
  onRefund,
  onDuplicateBooking,
  onSendInvoice,
  onAddNote,
  onFlagIssue,
}: BookingActionsDropdownProps<TBooking>) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  const setReference = refs.setReference;
  const setFloating = refs.setFloating;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const run = (fn: ((booking: TBooking) => void) | undefined) => {
    if (!fn) return;
    fn(booking);
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={setReference}
        type="button"
        title="Quick actions"
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-expanded={open}
        {...getReferenceProps()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          ref={setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className="z-50 max-h-[300px] w-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {onView ? <MenuAction label="View details" icon={<Eye size={14} />} onClick={() => run(onView)} /> : null}
          {onAssign ? <MenuAction label="Assign cleaner" icon={<UserRound size={14} />} onClick={() => run(onAssign)} /> : null}
          {onReschedule ? <MenuAction label="Reschedule" icon={<Calendar size={14} />} onClick={() => run(onReschedule)} /> : null}
          {onComplete ? <MenuAction label="Mark complete" icon={<Check size={14} />} onClick={() => run(onComplete)} /> : null}
          {onCancel ? <MenuAction label="Cancel booking" icon={<X size={14} />} onClick={() => run(onCancel)} /> : null}
          {onReassign ? <MenuAction label="Reassign" icon={<RefreshCcw size={14} />} onClick={() => run(onReassign)} /> : null}
          {onRefund || onDuplicateBooking || onSendInvoice || onAddNote || onFlagIssue ? (
            <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
          ) : null}
          {onRefund ? <MenuAction label="Refund" icon={<CircleDollarSign size={14} />} onClick={() => run(onRefund)} /> : null}
          {onDuplicateBooking ? <MenuAction label="Duplicate booking" icon={<Copy size={14} />} onClick={() => run(onDuplicateBooking)} /> : null}
          {onSendInvoice ? <MenuAction label="Send invoice" icon={<FileText size={14} />} onClick={() => run(onSendInvoice)} /> : null}
          {onAddNote ? <MenuAction label="Add note" icon={<NotebookPen size={14} />} onClick={() => run(onAddNote)} /> : null}
          {onFlagIssue ? <MenuAction label="Flag issue" icon={<BadgeAlert size={14} />} onClick={() => run(onFlagIssue)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
