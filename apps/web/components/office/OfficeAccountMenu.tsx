"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function OfficeAccountMenu({ userLabel, initials, onLogout }: { userLabel: string; initials: string; onLogout: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="Open account menu" className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold leading-tight text-foreground">Admin console</span>
          <span className="block max-w-[140px] truncate text-[11px] text-muted-foreground">{userLabel || "Administrator"}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
      <DropdownMenuLabel className="px-4">Account</DropdownMenuLabel>
      <p className="max-w-64 break-words px-4 pb-2 text-xs text-muted-foreground">{userLabel || "Administrator"}</p>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onLogout}><LogOut className="mr-2 h-4 w-4" aria-hidden />Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
