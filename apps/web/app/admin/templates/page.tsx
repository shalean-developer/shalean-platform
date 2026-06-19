import { redirect } from "next/navigation";

export default function AdminTemplatesRedirectPage() {
  redirect("/office/templates/editor");
}
