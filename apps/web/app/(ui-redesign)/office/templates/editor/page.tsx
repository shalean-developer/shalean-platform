"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { buildDefaultTemplatePreviewJson } from "@/lib/admin/templatePreviewDefaults";

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

export default function OfficeTemplatesEditorPage() {
  const searchParams = useSearchParams();
  const templateIdFromQuery = searchParams.get("templateId")?.trim() ?? "";

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
  const [previewJson, setPreviewJson] = useState(buildDefaultTemplatePreviewJson);
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
    const res = await adminFetch<{ templates?: TemplateRow[] }>("/api/admin/templates");
    if (!res.ok) {
      emitAdminToast(res.error ?? "Could not load templates.", "error");
      setTemplates([]);
      setLoading(false);
      return;
    }
    const rows = res.data?.templates ?? [];
    setTemplates(rows);
    setSelectedId((prev) => {
      if (prev && rows.some((t) => t.id === prev)) return prev;
      if (templateIdFromQuery && rows.some((t) => t.id === templateIdFromQuery)) {
        return templateIdFromQuery;
      }
      return rows[0]?.id ?? null;
    });
    setLoading(false);
  }, [templateIdFromQuery]);

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
    const res = await adminFetch<{ template?: TemplateRow }>("/api/admin/templates", {
      method: "PATCH",
      body: JSON.stringify({
        id: selected.id,
        subject: selected.channel === "email" ? subjectDraft : null,
        content: contentDraft,
        variables,
        is_active: activeDraft,
      }),
    });
    if (!res.ok) {
      emitAdminToast(res.error ?? "Save failed.", "error");
    } else {
      emitAdminToast("Saved.", "success");
      if (res.data?.template) {
        setTemplates((prev) => prev.map((t) => (t.id === res.data!.template!.id ? res.data!.template! : t)));
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
    const res = await adminFetch<{ subject?: string | null; content?: string }>("/api/admin/templates/preview", {
      method: "POST",
      body: JSON.stringify({ key: previewKey, channel: previewChannel, data }),
    });
    if (!res.ok) {
      emitAdminToast(res.error ?? "Preview failed.", "error");
      setPreviewSubject(null);
      setPreviewContent(null);
    } else {
      setPreviewSubject(res.data?.subject ?? null);
      setPreviewContent(typeof res.data?.content === "string" ? res.data.content : "");
    }
    setPreviewLoading(false);
  }

  async function runTestSend(recipient?: string) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(previewJson) as Record<string, unknown>;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad");
    } catch {
      emitAdminToast("Test JSON must be an object.", "error");
      return;
    }
    const to = recipient ?? testTo.trim();
    if (!to && recipient !== "self") {
      emitAdminToast("Enter a test recipient email or use Send to me.", "error");
      return;
    }
    setTestSending(true);
    const res = await adminFetch<{ success?: boolean; sent_to?: string }>("/api/admin/templates/test-send", {
      method: "POST",
      body: JSON.stringify({ key: previewKey, to: to || "self", data }),
    });
    if (!res.ok) {
      emitAdminToast(res.error ?? "Send failed.", "error");
    } else {
      emitAdminToast(`Test email sent to ${res.data?.sent_to ?? to ?? "your inbox"}.`, "success");
    }
    setTestSending(false);
  }

  const uniqueKeys = [...new Set(templates.map((t) => t.key))];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/office/templates"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to templates
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Template editor</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Edit notification copy in Supabase. Active{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">booking_confirmed</code> email is used at send-time when
            present; otherwise the built-in HTML fallback is used.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalog</CardTitle>
            <CardDescription>Select a template to edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500">No rows in templates. Run the latest Supabase migration.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full rounded-md px-2 py-2 text-left transition ${
                        t.id === selectedId
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-800 hover:bg-slate-200"
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
              <p className="text-sm text-slate-500">Select a template.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tpl-active"
                    checked={activeDraft}
                    onChange={(e) => setActiveDraft(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
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
            Preview JSON includes <code className="text-xs">payment_url</code> and{" "}
            <code className="text-xs">account_url</code> using{" "}
            <code className="text-xs">{getPublicAppUrlBase()}</code>. Only active templates resolve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Template key" value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => void runTestSend("self")}
                disabled={testSending}
              >
                {testSending ? "Sending…" : "Send to me"}
              </Button>
            </div>
          </div>
          {previewSubject !== null && previewChannel === "email" ? (
            <p className="text-sm text-slate-700">
              <span className="font-medium">Subject:</span> {previewSubject || "—"}
            </p>
          ) : null}
          {previewContent !== null ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Rendered</p>
              {previewChannel === "email" ? (
                <div
                  className="prose prose-sm max-w-none text-slate-900"
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-800">{previewContent}</pre>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
