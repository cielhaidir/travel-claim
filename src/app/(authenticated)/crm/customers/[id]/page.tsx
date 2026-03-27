import { redirect } from "next/navigation";

export default async function CrmCustomerRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  redirect(`/crm/organizations/${resolved.id}`);
}
