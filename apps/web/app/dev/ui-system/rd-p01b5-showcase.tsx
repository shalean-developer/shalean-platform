"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

export function RDP01B5Showcase() {
  const [service, setService] = useState("standard");

  return (
    <section
      className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]"
      aria-labelledby="rd-p01b5-title"
    >
      <div className="space-y-[var(--ui-space-6)]">
        <header className="space-y-[var(--ui-space-2)]">
          <div className="flex flex-wrap gap-[var(--ui-space-2)]">
            <StatusBadge tone="info">RD-P01B5</StatusBadge>
            <StatusBadge tone="warning">Closure validation</StatusBadge>
            <StatusBadge tone="neutral">Development only</StatusBadge>
          </div>
          <h2 id="rd-p01b5-title" className="text-[length:var(--ui-text-section-title)] font-semibold text-foreground">
            Primitive normalization specimens
          </h2>
          <p className="max-w-[var(--ui-container-md)] text-[length:var(--ui-text-body)] text-muted-foreground">
            Canonical FormField, StatusBadge and native Select presentation. These examples are local UI state only and do not call booking, payment, account or Office APIs.
          </p>
        </header>

        <div className="grid gap-[var(--ui-space-6)] lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>FormField</CardTitle>
              <CardDescription>Reusable label, helper and error composition.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-[var(--ui-space-5)]">
              <FormField label="Customer name" htmlFor="rdp01-name" helperText="Helper copy uses the canonical caption role.">
                <Input id="rdp01-name" placeholder="Customer name" />
              </FormField>
              <FormField label="Email" htmlFor="rdp01-email" required error="Enter a valid email address.">
                <Input
                  id="rdp01-email"
                  type="email"
                  defaultValue="not-an-email"
                  aria-invalid="true"
                  className="border-destructive focus-visible:outline-destructive"
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>StatusBadge</CardTitle>
              <CardDescription>Semantic tones only; domain status mapping stays outside the primitive.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-[var(--ui-space-3)]">
              <StatusBadge tone="neutral">Neutral</StatusBadge>
              <StatusBadge tone="info">Info</StatusBadge>
              <StatusBadge tone="success">Success</StatusBadge>
              <StatusBadge tone="warning">Warning</StatusBadge>
              <StatusBadge tone="critical">Critical</StatusBadge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Canonical Select</CardTitle>
              <CardDescription>Native select for ordinary forms; specialized booking listboxes remain separate.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                id="rdp01-service"
                label="Example service"
                value={service}
                onChange={(event) => setService(event.target.value)}
              >
                <option value="standard">Standard cleaning</option>
                <option value="deep">Deep cleaning</option>
                <option value="move">Move cleaning</option>
              </Select>
              <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-caption)] text-muted-foreground">
                Local specimen value: {service}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
