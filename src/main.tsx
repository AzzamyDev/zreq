import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "@/i18n/config";
import "./lib/monaco-setup";
import "./index.css";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { hydrateThemeAccent } from "./lib/themeAccent";

document.documentElement.classList.add('dark')
hydrateThemeAccent()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <App />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>,
);
