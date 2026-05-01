"use client";

import Link from "next/link";
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";

export default function AdminBlogNewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">New post</h1>
        <Link href="/admin/blog" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← List
        </Link>
      </div>
      <PostEditorForm mode="create" />
    </div>
  );
}
