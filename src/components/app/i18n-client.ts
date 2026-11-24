"use client";
import { useParams } from "next/navigation";
import { dict } from "./i18n";
// Dashboard strings for the locale in the current route.
export function useT() {
  const { locale } = useParams<{ locale: string }>();
  return dict(locale);
}
