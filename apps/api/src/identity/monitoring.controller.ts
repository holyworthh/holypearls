import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { StaffGuard } from "./staff.guard.js";

/** Sends a deliberate error to monitoring, to prove it works in each environment (T00-04). */
@Controller("admin/monitoring")
@UseGuards(StaffGuard("SECURITY_ADMIN"))
export class MonitoringController {
  @Post("test-error")
  @HttpCode(500)
  testError(): never {
    throw new Error("Monitoring test error (deliberate)");
  }
}
