"use client";

import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";

export default function AdminBlogNewPage() {
  return (
    <div className="w-full min-w-0 py-2 md:py-0">
      <PostEditorForm mode="create" />
    </div>
  );
}
