/*
 * Courier prices through Shipbubble (T08-05; owner, 2026-10-05). Shipbubble
 * is an aggregator: given a checked pickup and delivery address and the
 * parcel, it returns live rates from many Nigerian couriers. HolyPearls only
 * asks for addresses outside its fixed delivery zones; anything that stops a
 * price (no key, a missing weight, an error, a slow answer) falls back to
 * staff pricing. The fake courier below lets every rule be tested without it.
 */

export interface CourierAddress {
  name: string;
  email: string;
  phone: string;
  /** One line with area, state and country, as Shipbubble asks. */
  address: string;
}

export interface ParcelItem {
  name: string;
  description: string;
  unitWeightKg: number;
  /** Before VAT, in naira, as Shipbubble takes it (for insurance and couriers' checks). */
  unitAmountNaira: number;
  quantity: number;
}

export interface Parcel {
  items: ParcelItem[];
  dimensionCm: { length: number; width: number; height: number };
  weightKg: number;
}

export interface CourierRate {
  courierName: string;
  serviceCode: string;
  /** "pickup": the courier collects from the workshop; "dropoff": someone takes it to a station. */
  serviceType: "pickup" | "dropoff";
  /** What Shipbubble charges, VAT included, in kobo. */
  totalMinor: bigint;
  vatMinor: bigint;
  deliveryEta: string | null;
  deliveryEtaTime: string | null;
}

export interface CourierQuote {
  requestToken: string;
  rates: CourierRate[];
}

export interface Courier {
  readonly name: string;
  /** Checks an address and returns the courier's code for it. Throws CourierError when it can't. */
  validateAddress(address: CourierAddress): Promise<number>;
  rates(input: { senderCode: number; receiverCode: number; pickupDate: string; categoryId: number; parcel: Parcel }): Promise<CourierQuote>;
  categories(): Promise<{ id: number; name: string }[]>;
}

/** The courier refused or failed; the message is safe to show staff. */
export class CourierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourierError";
  }
}

/** A courier answer that takes longer than this falls back to staff pricing. */
export const COURIER_TIMEOUT_MS = 8_000;

const naira = (value: number | string) => BigInt(Math.round(Number(value) * 100));

/** Shipbubble's API (https://docs.shipbubble.com). Test keys start sb_sandbox_, live keys sb_prod_. */
export class ShipbubbleCourier implements Courier {
  readonly name = "Shipbubble";

  constructor(private readonly options: { apiKey: string; baseUrl?: string; fetch?: typeof fetch }) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const doFetch = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${this.options.baseUrl ?? "https://api.shipbubble.com/v1"}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(COURIER_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CourierError((error as Error).name === "TimeoutError" ? "The courier service took too long to answer." : "The courier service couldn't be reached.");
    }
    const json = (await response.json().catch(() => null)) as { status?: string; message?: string; errors?: string[]; data?: T } | null;
    if (!response.ok || json?.status !== "success" || json.data === undefined) {
      const detail = json?.errors?.length ? json.errors.join("; ") : json?.message;
      throw new CourierError(detail ? `Shipbubble: ${detail}` : `Shipbubble answered ${response.status}.`);
    }
    return json.data;
  }

  async validateAddress(address: CourierAddress) {
    const data = await this.call<{ address_code: number }>("POST", "/shipping/address/validate", address);
    return data.address_code;
  }

  async rates(input: { senderCode: number; receiverCode: number; pickupDate: string; categoryId: number; parcel: Parcel }): Promise<CourierQuote> {
    type Raw = { courier_name: string; service_code: string; service_type: string; total: number | string; vat?: number | string; delivery_eta?: string | null; delivery_eta_time?: string | null };
    const data = await this.call<{ request_token: string; couriers: Raw[] }>("POST", "/shipping/fetch_rates", {
      sender_address_code: input.senderCode,
      reciever_address_code: input.receiverCode,
      pickup_date: input.pickupDate,
      category_id: input.categoryId,
      package_items: input.parcel.items.map((item) => ({
        name: item.name,
        description: item.description,
        unit_weight: String(item.unitWeightKg),
        unit_amount: String(item.unitAmountNaira),
        quantity: String(item.quantity),
      })),
      package_dimension: input.parcel.dimensionCm,
    });
    return {
      requestToken: data.request_token,
      rates: data.couriers.map((raw) => ({
        courierName: raw.courier_name,
        serviceCode: raw.service_code,
        serviceType: raw.service_type === "dropoff" ? "dropoff" : "pickup",
        totalMinor: naira(raw.total),
        vatMinor: naira(raw.vat ?? 0),
        deliveryEta: raw.delivery_eta ?? null,
        deliveryEtaTime: raw.delivery_eta_time ?? null,
      })),
    };
  }

  async categories() {
    const data = await this.call<{ category_id: number; category: string }[]>("GET", "/shipping/labels/categories");
    return data.map((row) => ({ id: row.category_id, name: row.category }));
  }
}

export function createCourier(env: { SHIPBUBBLE_API_KEY?: string }): Courier | null {
  return env.SHIPBUBBLE_API_KEY ? new ShipbubbleCourier({ apiKey: env.SHIPBUBBLE_API_KEY }) : null;
}

/** One order line, with the shipping data of the product (or of its size choice). */
export interface ShippingLine {
  name: string;
  quantity: number;
  /** Before VAT, per unit, in kobo. */
  unitMinor: bigint;
  weightGrams: number;
  packageCm: { length: number; width: number; height: number };
  unitsPerPackage: number;
}

/**
 * The parcel sent for a price: every line's weight, and its boxes stacked on
 * the largest footprint. A courier re-weighs at pickup, so this aims to be
 * close, not exact (Shipbubble charges the difference).
 */
export function parcelFor(lines: ShippingLine[]): Parcel {
  const boxes = lines.map((line) => ({ ...line.packageCm, count: Math.ceil(line.quantity / Math.max(1, line.unitsPerPackage)) }));
  const length = Math.max(...boxes.map((box) => Math.max(box.length, box.width)));
  const width = Math.max(...boxes.map((box) => Math.min(box.length, box.width)));
  const height = boxes.reduce((sum, box) => sum + box.height * box.count, 0);
  const items = lines.map((line) => ({
    name: line.name,
    description: `${line.name} × ${line.quantity.toLocaleString("en-NG")}`,
    unitWeightKg: line.weightGrams / 1000,
    unitAmountNaira: Number(line.unitMinor) / 100,
    quantity: line.quantity,
  }));
  return { items, dimensionCm: { length, width, height }, weightKg: items.reduce((sum, item) => sum + item.unitWeightKg * item.quantity, 0) };
}

/** Rates HolyPearls can use: couriers that collect from the workshop. */
export function chooseRate(rates: CourierRate[], rule: "CHEAPEST" | "FASTEST"): CourierRate | null {
  const collecting = rates.filter((rate) => rate.serviceType === "pickup" && rate.totalMinor > 0n);
  if (!collecting.length) return null;
  const sorted = [...collecting].sort((a, b) => {
    if (rule === "FASTEST" && a.deliveryEtaTime && b.deliveryEtaTime && a.deliveryEtaTime !== b.deliveryEtaTime) return a.deliveryEtaTime < b.deliveryEtaTime ? -1 : 1;
    return a.totalMinor < b.totalMinor ? -1 : a.totalMinor > b.totalMinor ? 1 : 0;
  });
  return sorted[0]!;
}

/** The fake courier for tests: two collecting couriers, one drop-off, and failures on demand. */
export class FakeCourier implements Courier {
  readonly name = "Fake courier";
  readonly pickupCode = 11_000_001;
  rateCalls: { receiverCode: number; parcel: Parcel }[] = [];
  lastToken: string | null = null;
  private failure: string | null = null;

  reset() {
    this.rateCalls = [];
    this.failure = null;
  }

  failNext(message: string) {
    this.failure = message;
  }

  private takeFailure() {
    const failure = this.failure;
    this.failure = null;
    if (failure) throw new CourierError(failure);
  }

  async validateAddress(address: CourierAddress) {
    this.takeFailure();
    return /workshop/i.test(address.address) ? this.pickupCode : 22_000_000 + (address.address.length % 1000);
  }

  async rates(input: { senderCode: number; receiverCode: number; pickupDate: string; categoryId: number; parcel: Parcel }): Promise<CourierQuote> {
    this.takeFailure();
    this.rateCalls.push({ receiverCode: input.receiverCode, parcel: input.parcel });
    this.lastToken = `fake_token_${this.rateCalls.length}_${Date.now()}`;
    return {
      requestToken: this.lastToken,
      rates: [
        // ₦4,837.50 with VAT is ₦4,500 before VAT.
        { courierName: "Cheap Collect", serviceCode: "cheap", serviceType: "pickup", totalMinor: 483_750n, vatMinor: 33_750n, deliveryEta: "Within 2 - 4 working days", deliveryEtaTime: "2026-10-12 12:00:00" },
        { courierName: "Quick Collect", serviceCode: "quick", serviceType: "pickup", totalMinor: 860_000n, vatMinor: 60_000n, deliveryEta: "Within 1 working day", deliveryEtaTime: "2026-10-08 12:00:00" },
        { courierName: "Station Drop", serviceCode: "station", serviceType: "dropoff", totalMinor: 200_000n, vatMinor: 14_000n, deliveryEta: "Within 5 working days", deliveryEtaTime: "2026-10-14 12:00:00" },
      ],
    };
  }

  async categories() {
    return [
      { id: 98246239, name: "Fashion wears" },
      { id: 90097994, name: "Accessories" },
    ];
  }
}
