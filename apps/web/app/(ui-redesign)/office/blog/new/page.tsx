"use client";

import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";

export default function OfficeBlogNewPage() {
  return (
    <div className="w-full min-w-0">
      <PostEditorForm mode="create" postsListPath="/office/blog" />
    </div>
  );
}
