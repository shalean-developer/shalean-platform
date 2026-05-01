"use client";

import { motion } from "framer-motion";
import {
  AppWindow,
  Boxes,
  BrickWall,
  Home,
  Leaf,
  Microwave,
  Refrigerator,
  Shirt,
  Sparkles,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

export type AddOn = {
  id: string;
  label: string;
  price: number;
  icon: LucideIcon;
};

const ADD_ON_ICONS: Record<string, LucideIcon> = {
  fridge: Refrigerator,
  "inside-fridge": Refrigerator,
  oven: Microwave,
  "inside-oven": Microwave,
  cabinets: Boxes,
  "inside-cabinets": Boxes,
  windows: AppWindow,
  "interior-windows": AppWindow,
  walls: BrickWall,
  "interior-walls": BrickWall,
  plants: Leaf,
  "water-plants": Leaf,
  ironing: Shirt,
  laundry: WashingMachine,
  flatlet: Home,
  "small-flatlet": Home,
};

export function iconForAddOn(id: string): LucideIcon {
  return ADD_ON_ICONS[id] ?? Sparkles;
}

type AddOnItemProps = {
  addOn: AddOn;
  selected: boolean;
  onToggle: (id: string) => void;
};

export function AddOnItem({ addOn, selected, onToggle }: AddOnItemProps) {
  const Icon = addOn.icon;

  return (
    <motion.button
      type="button"
      onClick={() => onToggle(addOn.id)}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      aria-pressed={selected}
      aria-label={`${selected ? "Deselect" : "Select"} ${addOn.label} add-on (+R${addOn.price})`}
      className="group flex w-full flex-col items-center gap-1.5 focus:outline-none"
    >
      <div
        className={[
          "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 lg:h-14 lg:w-14",
          selected
            ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
            : "border-emerald-400/70 bg-white hover:border-emerald-500 hover:shadow-sm hover:shadow-emerald-100/60",
        ].join(" ")}
      >
        <Icon
          className={[
            "h-5 w-5 stroke-[1.5] transition-colors duration-200",
            selected ? "text-emerald-600" : "text-slate-500 group-hover:text-emerald-500",
          ].join(" ")}
        />
        {selected ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-emerald-500"
          >
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        ) : null}
      </div>

      <div className="text-center">
        <p
          className={[
            "text-[10px] font-semibold leading-tight transition-colors duration-200 lg:text-[11px]",
            selected ? "text-emerald-700" : "text-slate-600 group-hover:text-slate-800",
          ].join(" ")}
        >
          {addOn.label}
        </p>
        <p
          className={[
            "mt-0.5 text-[9px] font-medium transition-colors duration-200 lg:text-[10px]",
            selected ? "text-emerald-500" : "text-slate-400",
          ].join(" ")}
        >
          +R{addOn.price}
        </p>
      </div>
    </motion.button>
  );
}

type AddOnsSelectorProps = {
  addOns: AddOn[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

export function AddOnsSelector({ addOns, selectedIds, onToggle }: AddOnsSelectorProps) {
  const extrasTotal = selectedIds.reduce((sum, id) => {
    const found = addOns.find((addOn) => addOn.id === id);
    return sum + (found?.price ?? 0);
  }, 0);

  if (addOns.length === 0) {
    return (
      <div>
        <div className="mb-2.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Add Extras <span className="font-medium normal-case text-slate-300">(Optional)</span>
          </label>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs font-medium text-slate-500">
          No active add-ons are available right now.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
          Add Extras <span className="font-medium normal-case text-slate-300">(Optional)</span>
        </label>
        <p className="mt-0.5 text-[10px] text-slate-400">Tap to add to your clean</p>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-3 md:grid-cols-4 lg:grid-cols-6">
        {addOns.map((addOn) => (
          <AddOnItem key={addOn.id} addOn={addOn} selected={selectedIds.includes(addOn.id)} onToggle={onToggle} />
        ))}
      </div>

      {selectedIds.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-2.5 flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2"
        >
          <p className="text-xs font-semibold text-emerald-700">
            {selectedIds.length} extra{selectedIds.length > 1 ? "s" : ""} added
          </p>
          <p className="text-xs font-bold text-emerald-600">+R{extrasTotal}</p>
        </motion.div>
      ) : null}
    </div>
  );
}
