import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

// ─── Tipe ─────────────────────────────────────────────────────────────────

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => undefined,
  isDark: true,
});

// ─── Provider ─────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("hs_theme");
    // Command Center adalah workspace operasional; mode gelap menjadi default
    // agar selaras dengan referensi war-room dan mengurangi glare saat shift.
    return stored === "dark" || stored === "light" ? stored : "dark";
  });

  // Terapkan ke dokumen
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("hs_theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
