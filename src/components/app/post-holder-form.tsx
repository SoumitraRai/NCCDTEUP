"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
// Sets up, or hands over, the account for a DDG/ADG post.
export function PostHolderForm({ code, title, handover }: { code: string; title: string; handover: boolean }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().posts;
  const [v, setV] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // With email off, the server returns the one-time link to show here once.
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ link?: string }>(`posts/${code}`, "POST", v);
      if (r.link) setLink(r.link);
      else set({ post: null, saved: "1" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };
  if (link)
    return (
      <Drawer title={t.linkTitle} closeKeys={["post"]} footer={<div className="flex justify-end"><Button variant="primary" onClick={() => set({ post: null })}>{t.done}</Button></div>}>
        <div className="space-y-4">
          <Alert tone="success">{t.linkHint}</Alert>
          <input readOnly aria-label={t.linkTitle} value={link} className={`${inputClass} font-mono text-[13px]`} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? t.copied : t.copy}</Button>
        </div>
      </Drawer>
    );
  return (
    <Drawer
      title={t.formTitle(title)}
      closeKeys={["post"]}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{handover ? t.handoverWarning : ""}</p>
          <Button variant="primary" busy={busy} onClick={save}>{t.save}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        <Field label={t.name}><input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="off" /></Field>
        <Field label={t.email}><input type="email" className={inputClass} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="off" /></Field>
        <Field label={t.phone}><input inputMode="numeric" maxLength={10} className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value.replace(/\D/g, "") })} autoComplete="off" /></Field>
      </form>
    </Drawer>
  );
}
