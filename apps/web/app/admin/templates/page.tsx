"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TemplateChannel = "email" | "whatsapp" | "sms";

type TemplateRow = {
  id: string;
  key: string;
  channel: TemplateChannel;
  subject: string | null;
  content: string;
  variables: unknown;
  is_active: boolean;
};

const DEFAULT_PREVIEW_JSON = `{
  "customer_name": "Test Customer",
  "date": "Mon, 1 Dec 2025",
  "time": "09:00",
  "price": "R 299",
  "booking_id": "00000000-0000-4000-8000-000000000001"
}`;

export default function AdminTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [variablesDraft, setVariablesDraft] = useState("[]");
  const [activeDraft, setActiveDraft] = useState(true);
  const [saving, setSaving] = useState(false);

  const [previewKey, setPreviewKey] = useState("booking_confirmed");
  const [previewChannel, setPreviewChannel] = useState<TemplateChannel>("email");
  const [previewJson, setPreviewJson] = useState(DEFAULT_PREVIEW_JSON);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/templates", { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as { templates?: TemplateRow[]; error?: string };
    if (!res.ok) {
      emitAdminToast(j.error ?? "Could not load templates.", "error");
      setTemplates([]);
    } else {
      setTemplates(j.templates ?? []);
      setSelectedId((prev) => prev ?? (j.templates?.[0]?.id ?? null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setSubjectDraft(selected.subject ?? "");
    setContentDraft(selected.content);
    try {
      setVariablesDraft(JSON.stringify(selected.variables ?? [], null, 2));
    } catch {
      setVariablesDraft("[]");
    }
    setActiveDraft(selected.is_active);
    setPreviewKey(selected.key);
    setPreviewChannel(selected.channel);
  }, [selected]);

  async function saveSelected() {
    if (!selected) return;
    let variables: unknown;
    try {
      variables = JSON.parse(variablesDraft) as unknown;
    } catch {
      emitAdminToast("Variables must be valid JSON.", "error");
      return;
    }
    if (!Array.isArray(variables) || variables.some((v) => typeof v !== "string")) {
      emitAdminToast("Variables must be a JSON array of strings.", "error");
      return;
    }

    setSaving(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setSaving(false);
      return;
    }
    const res = await fetch("/api/admin/templates", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        subject: selected.channel === "email" ? subjectDraft : null,
        content: contentDraft,
        variables,
        is_active: activeDraft,
      }),
    });
    const j = (await res.json()) as { template?: TemplateRow; error?: string };
    if (!res.ok) {
      emitAdminToast(j.error ?? "Save failed.", "error");
    } else {
      emitAdminToast("Saved.", "success");
      if (j.template) {
        setTemplates((prev) => prev.map((t) => (t.id === j.template!.id ? j.template! : t)));
      }
    }
    setSaving(false);
  }

  async function runPreview() {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(previewJson) as Record<string, unknown>;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad");
    } catch {
      emitAdminToast("Preview JSON must be an object.", "error");
      return;
    }
    setPreviewLoading(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setPreviewLoading(false);
      return;
    }
    const res = await fetch("/api/admin/templates/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: previewKey, channel: previewChannel, data }),
    });
    const j = (await res.json()) as { subject?: string | null; content?: string; error?: string };
    if (!res.ok) {
      emitAdminToast(j.error ?? "Preview failed.", "error");
      setPreviewSubject(null);
      setPreviewContent(null);
    } else {
      setPreviewSubject(j.subject ?? null);
      setPreviewContent(typeof j.content === "string" ? j.content : "");
    }
    setPreviewLoading(false);
  }

  async function runTestSend() {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(previewJson) as Record<string, unknown>;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad");
    } catch {
      emitAdminToast("Test JSON must be an object.", "error");
      return;
    }
    if (!testTo.trim()) {
      emitAdminToast("Enter a test recipient email.", "error");
      return;
    }
    setTestSending(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setTestSending(false);
      return;
    }
    const res = await fetch("/api/admin/templates/test-send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: previewKey, to: testTo.trim(), data }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok) {
      emitAdminToast(j.error ?? "Send failed.", "error");
    } else {
      emitAdminToast("Test email sent.", "success");
    }
    setTestSending(false);
  }

  const uniqueKeys = [...new Set(templates.map((t) => t.key))];

  return (
    <main className="mx-auto max-w-6xl space-y-8 pb-16">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Templates</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Edit notification copy stored in Supabase. Booking confirmation email uses the active{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">booking_confirmed</code> email row
          when present; otherwise the built-in HTML email is used.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalog</CardTitle>
            <CardDescription>Select a template to edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-500">No rows in `templates`. Run the latest Supabase migration.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full rounded-md px-2 py-2 text-left transition ${
                        t.id === selectedId
                          ? "bg-blue-600 text-white dark:bg-blue-600"
                          : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <span className="font-medium">{t.key}</span>
                      <span className="opacity-80"> · {t.channel}</span>
                      {!t.is_active ? <span className="ml-2 text-xs opacity-90">(inactive)</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editor</CardTitle>
            <CardDescription>Subject applies to email only. Variables: JSON array of placeholder names.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="text-sm text-zinc-500">Select a template.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tpl-active"
                    checked={activeDraft}
                    onChange={(e) => setActiveDraft(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <Label htmlFor="tpl-active" className="text-sm font-normal">
                    Active
                  </Label>
                </div>
                {selected.channel === "email" ? (
                  <div className="space-y-2">
                    <Label htmlFor="tpl-subject">Subject</Label>
                    <Input
                      id="tpl-subject"
                      value={subjectDraft}
                      onChange={(e) => setSubjectDraft(e.target.value)}
                      placeholder="Subject with {{placeholders}}"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="tpl-content">Content</Label>
                  <Textarea
                    id="tpl-content"
                    value={contentDraft}
                    onChange={(e) => setContentDraft(e.target.value)}
                    rows={12}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-vars">Variables (JSON array)</Label>
                  <Textarea
                    id="tpl-vars"
                    value={variablesDraft}
                    onChange={(e) => setVariablesDraft(e.target.value)}
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
                <Button type="button" onClick={() => void saveSelected()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview &amp; test send</CardTitle>
          <CardDescription>
            Only active templates resolve. Test send uses the email channel for the selected key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Template key"
              value={previewKey}
              onChange={(e) => setPreviewKey(e.target.value)}
            >
              {(uniqueKeys.length ? uniqueKeys : [previewKey]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Select
              label="Channel"
              value={previewChannel}
              onChange={(e) => setPreviewChannel(e.target.value as TemplateChannel)}
            >
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="sms">sms</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preview-json">JSON test data</Label>
            <Textarea
              id="preview-json"
              value={previewJson}
              onChange={(e) => setPreviewJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder="{ }"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void runPreview()} disabled={previewLoading}>
              {previewLoading ? "Preview…" : "Preview"}
            </Button>
            <div className="flex flex-1 flex-wrap items-end gap-2 sm:min-w-[240px]">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="test-to">Test recipient (email)</Label>
                <Input
                  id="test-to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              <Button type="button" onClick={() => void runTestSend()} disabled={testSending}>
                {testSending ? "Sending…" : "Send test"}
              </Button>
            </div>
          </div>
          {previewSubject !== null && previewChannel === "email" ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Subject:</span> {previewSubject || "—"}
            </p>
          ) : null}
          {previewContent !== null ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Rendered</p>
              {previewChannel === "email" ? (
                <div
                  className="prose prose-sm max-w-none text-zinc-900 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-800 dark:text-zinc-200">
                  {previewContent}
                </pre>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
