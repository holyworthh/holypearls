import { PROJECT_STEPS, projectSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Your project", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A project link (guest links land here, PROJ-FR-007) opens the step the customer was on. Not yours: 404. */
export default async function ProjectResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const project = await serverApi(`/v1/projects/${id}`, projectSchema);
  if (!project.ok) notFound();
  redirect(`/start/${id}/${PROJECT_STEPS.find((step) => step.key === project.data.step)!.slug}`);
}
