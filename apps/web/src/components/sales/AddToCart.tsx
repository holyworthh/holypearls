"use client";

import { ApiError, type Configuration, cartSchema } from "@holypearls/contracts";
import { Button, ButtonLink } from "@holypearls/ui";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";

/**
 * Puts the saved design in the cart (COM-FR-080) and opens the cart. A design
 * that needs a quote goes in the cart's "Needs a quote" group; it's never
 * charged at checkout (COM-FR-081).
 */
export function AddToCart({
  draft,
  ensure,
  className,
  label = "Add to bag",
  disabled = false,
}: {
  draft: Configuration | null;
  ensure: () => Promise<Configuration | null>;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (draft?.status === "IN_CART") {
    return (
      <ButtonLink href="/cart" variant="secondary" fullWidth>
        In your cart · View cart
      </ButtonLink>
    );
  }
  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      const current = await ensure();
      if (!current) return;
      await api("/v1/cart/items", { method: "POST", body: { configurationId: current.id }, response: cartSchema });
      router.push("/cart");
    } catch (failure) {
      setError(failure instanceof ApiError ? (Object.values(failure.body.fieldErrors ?? {})[0] ?? failure.body.message) : "We couldn't add it. Try again.");
      setAdding(false);
    }
  };
  return (
    <>
      {className ? (
        <button type="button" className={className} disabled={disabled || adding} aria-busy={adding} onClick={() => void add()}>
          <ShoppingBag size={18} strokeWidth={2} aria-hidden="true" />
          {adding ? "Adding…" : label}
        </button>
      ) : (
        <Button variant="secondary" fullWidth disabled={disabled} loading={adding} onClick={() => void add()} icon={<ShoppingBag size={16} strokeWidth={2} aria-hidden="true" />}>
          {label}
        </Button>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
