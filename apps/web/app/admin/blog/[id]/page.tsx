import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

/** Legacy admin edit URL — editor lives under the office shell. */
export default async function AdminBlogEditPage({ params }: Props) {
  const { id } = await params;
  if (!id?.trim()) {
    redirect("/office/blog");
  }
  redirect(`/office/blog/${encodeURIComponent(id.trim())}`);
}
