"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

class JobAlreadyExistsError extends Error {}

export async function convertQuoteToJob(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: true,
      lead: { include: { project: true, service: true } },
    },
  });
  if (!quote) {
    return { error: "Quote not found", jobId: null };
  }
  if (quote.status !== "ACCEPTED") {
    return { error: "Only an accepted quote can be converted to a job.", jobId: null };
  }

  const includedItems = quote.items.filter((item) => item.isIncluded);

  let jobId: string;
  try {
    jobId = await prisma.$transaction(async (tx) => {
      const existingJob = await tx.job.findFirst({ where: { leadId: quote.leadId } });
      if (existingJob) {
        throw new JobAlreadyExistsError();
      }

      const job = await tx.job.create({
        data: {
          quoteId: quote.id,
          leadId: quote.leadId,
          customerId: quote.lead.customerId,
          scopeOfWork: quote.lead.service.name,
          addressStreet: quote.lead.project?.addressStreet ?? "",
          addressCity: quote.lead.project?.addressCity ?? "",
          addressState: quote.lead.project?.addressState ?? "",
          addressZip: quote.lead.project?.addressZip ?? "",
        },
      });

      if (includedItems.length > 0) {
        await tx.jobLineItem.createMany({
          data: includedItems.map((item) => ({
            jobId: job.id,
            type: item.type === "LABOR" ? "LABOR" : "MATERIAL",
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: Number(item.quantity.toString()) * Number(item.unitPrice.toString()),
          })),
        });
      }

      await tx.lead.update({ where: { id: quote.leadId }, data: { status: "SCHEDULED" } });

      return job.id;
    });
  } catch (err) {
    if (err instanceof JobAlreadyExistsError) {
      return { error: "A job already exists for this lead.", jobId: null };
    }
    throw err;
  }

  revalidatePath(`/admin/leads/${quote.leadId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  return { error: null, jobId };
}
