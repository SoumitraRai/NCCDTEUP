"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, api } from "./ui";
import { useT } from "./i18n-client";
// A head gives or withdraws the registration-approval duty for one officer.
export function DutyToggle({ id, name, on }: { id: string; name: string; on: boolean }) {
  const router = useRouter();
  const t = useT().officers;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={on ? "secondary" : "primary"}
        busy={busy}
        aria-label={`${t.dutyFor(name)}: ${on ? t.withdraw : t.give}`}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`officers/${id}/duty`, "POST", { enabled: !on });
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
