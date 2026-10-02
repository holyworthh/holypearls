import { Controller, Get, Inject, Param, ParseUUIDPipe, Req, Res } from "@nestjs/common";
import type { Database } from "@holypearls/db";
import type { Request, Response } from "express";
import { deviceKey } from "../configuration/drafts.controller.js";
import { DATABASE } from "../tokens.js";
import { getOrder, getReceipt, type OrderAccess } from "./orders.js";
import { receiptPdf } from "./receipt-pdf.js";

const uuid = new ParseUUIDPipe();

async function access(request: Request): Promise<OrderAccess> {
  return { actor: await request.getActor!(), deviceKey: deviceKey(request) };
}

/**
 * A customer's order and its receipts (COM-FR-085, PAY-FR-006). The account,
 * the browser that paid, or the order's secure link; anyone else gets 404.
 * Private, never cached (TECH-02 §6).
 */
@Controller("orders")
export class OrdersController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get(":id")
  async get(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("id", uuid) id: string) {
    response.setHeader("cache-control", "private, no-store");
    return getOrder(this.db, await access(request), id);
  }

  @Get(":id/receipts/:receiptId")
  async receipt(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("id", uuid) id: string, @Param("receiptId", uuid) receiptId: string) {
    response.setHeader("cache-control", "private, no-store");
    return getReceipt(this.db, await access(request), id, receiptId);
  }

  /** The receipt as a PDF download, made from the same record as the page. */
  @Get(":id/receipts/:receiptId/pdf")
  async receiptPdf(@Req() request: Request, @Res() response: Response, @Param("id", uuid) id: string, @Param("receiptId", uuid) receiptId: string) {
    const receipt = await getReceipt(this.db, await access(request), id, receiptId);
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("content-type", "application/pdf");
    response.setHeader("content-disposition", `attachment; filename="${receipt.number}.pdf"`);
    response.send(Buffer.from(receiptPdf(receipt)));
  }
}
