import { redirect } from "next/navigation";

export default function CrmCustomersRedirectPage() {
  redirect("/crm/organizations");
}
