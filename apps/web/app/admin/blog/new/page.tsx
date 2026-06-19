import { redirect } from "next/navigation";

/** Legacy admin new-post URL — editor lives under the office shell. */
export default function AdminBlogNewPage() {
  redirect("/office/blog/new");
}
