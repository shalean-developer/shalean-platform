"use client";

import { useState, type FormEvent } from "react";

const CONTACT_EMAIL = "hello@shalean.co.za";

export const CONTACT_FORM_TOPICS = [
  { value: "new-booking", label: "New booking" },
  { value: "existing-booking", label: "Existing booking" },
  { value: "reschedule", label: "Reschedule" },
  { value: "payments", label: "Payments & invoices" },
  { value: "complaint", label: "Complaint or feedback" },
  { value: "cleaner-application", label: "Cleaner application" },
  { value: "business", label: "Business enquiry" },
  { value: "general", label: "General enquiry" },
] as const;

type TopicValue = (typeof CONTACT_FORM_TOPICS)[number]["value"];

export function ContactPageForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<TopicValue>("general");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topicLabel = CONTACT_FORM_TOPICS.find((t) => t.value === topic)?.label ?? "Enquiry";
    const subject = `Shalean contact: ${topicLabel}`;
    const body = [
      `Name: ${name.trim()}`,
      `Email: ${email.trim()}`,
      phone.trim() ? `Phone: ${phone.trim()}` : null,
      `Topic: ${topicLabel}`,
      "",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:p-8">
      <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Send us a message</h2>
      <p className="mt-2 text-sm text-slate-600">
        Fill in the form and your email app will open with your message ready to send.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-500">(optional)</span>
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Topic
          <select
            name="topic"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value as TopicValue)}
            className={inputClass}
          >
            {CONTACT_FORM_TOPICS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Message
        <textarea
          name="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} resize-y`}
          placeholder="Tell us how we can help…"
        />
      </label>

      <button
        type="submit"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Compose email
      </button>
    </form>
  );
}
