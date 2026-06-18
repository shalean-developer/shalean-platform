import { MapPin, Pencil, Trash2, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomerAddressRow } from "@/lib/dashboard/types";

interface PropertyCardProps {
  address: CustomerAddressRow;
  onEdit: (address: CustomerAddressRow) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  busy?: boolean;
}

export function PropertyCard({ address: a, onEdit, onDelete, onSetDefault, busy }: PropertyCardProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <MapPin className="h-6 w-6 text-blue-600" strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900">{a.label || "Property"}</p>
              {a.is_default ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Primary
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-gray-800">{a.line1}</p>
            <p className="text-sm text-gray-500">
              {a.suburb}, {a.city} {a.postal_code}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!a.is_default ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={busy}
              onClick={() => onSetDefault(a.id)}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              Set primary
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={busy}
            onClick={() => onEdit(a)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-red-600 hover:border-red-200 hover:bg-red-50"
            disabled={busy}
            onClick={() => onDelete(a.id)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}
