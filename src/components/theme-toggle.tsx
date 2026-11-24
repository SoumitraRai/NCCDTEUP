"use client";
import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <button
      className="icon-button"
      aria-label="Toggle light or dark theme / थीम बदलें"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunMoon size={19} />
    </button>
  );
}
