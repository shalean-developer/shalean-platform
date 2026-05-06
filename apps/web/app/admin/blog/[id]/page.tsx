"use client";

import { useParams } from "next/navigation";
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";

export default function AdminBlogEditPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="w-full min-w-0 py-2 md:py-0">
      {id ? <PostEditorForm mode="edit" postId={id} /> : <p className="text-sm text-zinc-600">Missing post id.</p>}
    </div>
  );
}
