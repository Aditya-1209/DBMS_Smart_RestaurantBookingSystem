import { redirect, notFound } from "next/navigation";
import { currentActor } from "@/lib/auth";
import RestaurantApp from "@/components/RestaurantApp";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const p = await params;
  const view = p.view?.[0] || "menu";
  if (
    (p.view?.length || 0) > 1 ||
    ![
      "menu",
      "login",
      "register",
      "reservations",
      "orders",
      "preferences",
      "staff",
      "admin",
    ].includes(view)
  )
    notFound();
  if (
    ["reservations", "orders", "preferences", "staff", "admin"].includes(view)
  ) {
    const actor = await currentActor();
    if (!actor) redirect("/login");
    if (view === "admin" && actor.role !== "admin") redirect("/menu");
    if (view === "staff" && actor.role === "customer") redirect("/menu");
    if (view === "preferences" && actor.role !== "customer") redirect("/menu");
  }
  return <RestaurantApp view={view} />;
}
