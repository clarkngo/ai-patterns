export type Theme = "light" | "dark";

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function initThemeToggle(button: HTMLButtonElement): void {
  const sync = () => {
    button.setAttribute("aria-pressed", String(getTheme() === "dark"));
    button.textContent = getTheme() === "dark" ? "☀️ Light" : "🌙 Dark";
  };
  sync();
  button.addEventListener("click", () => {
    toggleTheme();
    sync();
  });
}
