import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";

import { SWRProvider } from "@/components/swr-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

// Explicit, sane viewport. width=device-width + initial-scale=1; user zoom is
// LEFT ENABLED (accessibility) — the iOS zoom-on-focus jank is fixed via the
// 16px form-control rule in globals.css, not by disabling scale.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme-mode={theme_mode}
        data-theme-preset={theme_preset}
        data-content-layout={content_layout}
        data-navbar-style={navbar_style}
        data-sidebar-variant={sidebar_variant}
        data-sidebar-collapsible={sidebar_collapsible}
        data-font={font}
        suppressHydrationWarning
      >
        <head>
          <ThemeBootScript />
        </head>
        <body className={`${fontVars} min-h-screen antialiased`}>
          <TooltipProvider>
            <PreferencesStoreProvider
              themeMode={theme_mode}
              themePreset={theme_preset}
              contentLayout={content_layout}
              navbarStyle={navbar_style}
              font={font}
            >
              <SWRProvider>{children}</SWRProvider>
              <Toaster />
            </PreferencesStoreProvider>
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
