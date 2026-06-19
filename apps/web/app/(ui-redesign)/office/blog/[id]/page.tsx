"use client";

import { useParams } from "next/navigation";
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";

export default function OfficeBlogEditPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="w-full min-w-0">
      {id ? (
        <PostEditorForm mode="edit" postId={id} postsListPath="/office/blog" />
      ) : (
        <p className="text-sm text-slate-600">Missing post id.</p>
      )}
    </div>
  );
}
