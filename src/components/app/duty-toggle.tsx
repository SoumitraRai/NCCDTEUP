"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, api } from "./ui";
import { useT } from "./i18n-client";
// A head gives or withdraws a duty for one officer: approving registrations,
// or "movement" (the Branch step of temporary duty).
export function DutyToggle({ id, name, on, duty = "registrations" }: { id: string; name: string; on: boolean; duty?: "registrations" | "movement" }) {
  const router = useRouter();
  const t = useT().officers;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={on ? "secondary" : "primary"}
        busy={busy}
        aria-label={`${duty === "movement" ? t.movementFor(name) : t.dutyFor(name)}: ${on ? t.withdraw : t.give}`}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`officers/${id}/duty`, "POST", { duty, enabled: !on });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "");
          } finally {
            setBusy(false);
          }
        }}
      >
        {on ? t.withdraw : t.give}
      </Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
