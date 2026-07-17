"use client";

import { useEffect, useState } from "react";

import { Minus, Plus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FontKey } from "@/lib/fonts/registry";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@/lib/preferences/layout-utils";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { applyThemePreset } from "@/lib/preferences/theme-utils";
import { readScanPreference, type ScanPreference, writeScanPreference } from "@/lib/ocr/scan-preference";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

// ── Panel Zoom (scoped to StopDetailPanel body only) ─────────────────────────
const PANEL_ZOOM_KEY = "routely_panel_zoom";
const ZOOM_STEPS = [80, 85, 90, 95, 100, 105, 110] as const;
type PanelZoom = (typeof ZOOM_STEPS)[number];

function readPanelZoom(): PanelZoom {
  if (typeof window === "undefined") return 90;
  const v = Number(localStorage.getItem(PANEL_ZOOM_KEY) ?? "90");
  return (ZOOM_STEPS.includes(v as PanelZoom) ? v : 90) as PanelZoom;
}

function applyPanelZoom(zoom: PanelZoom) {
  // Only sets a CSS variable — consumed exclusively by StopDetailPanel's
  // scrollable body via style={{ zoom: 'var(--panel-zoom, 1)' }}.
  // Nothing else in the layout is affected.
  document.documentElement.style.setProperty("--panel-zoom", (zoom / 100).toString());
}

export function LayoutControls() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout);
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle);
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle);
  const variant = usePreferencesStore((s) => s.sidebarVariant);
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant);
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible);
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible);
  const setFont = usePreferencesStore((s) => s.setFont);

  const [panelZoom, setPanelZoom] = useState<PanelZoom>(90);
  const [scanPreference, setScanPreference] = useState<ScanPreference>("qwen");

  useEffect(() => {
    const saved = readPanelZoom();
    setPanelZoom(saved);
    applyPanelZoom(saved);
    setScanPreference(readScanPreference());
  }, []);

  const onPanelZoomChange = (zoom: PanelZoom) => {
    setPanelZoom(zoom);
    applyPanelZoom(zoom);
    localStorage.setItem(PANEL_ZOOM_KEY, String(zoom));
  };

  const onScanPreferenceChange = (value: ScanPreference | "") => {
    if (!value) return;
    setScanPreference(value);
    writeScanPreference(value);
  };

  const onThemePresetChange = async (preset: ThemePreset) => {
    applyThemePreset(preset);
    setThemePreset(preset);
    persistPreference("theme_preset", preset);
  };

  const onThemeModeChange = async (mode: ThemeMode | "") => {
    if (!mode) return;
    setThemeMode(mode);
    persistPreference("theme_mode", mode);
  };

  const onContentLayoutChange = async (layout: ContentLayout | "") => {
    if (!layout) return;
    applyContentLayout(layout);
    setContentLayout(layout);
    persistPreference("content_layout", layout);
  };

  const onNavbarStyleChange = async (style: NavbarStyle | "") => {
    if (!style) return;
    applyNavbarStyle(style);
    setNavbarStyle(style);
    persistPreference("navbar_style", style);
  };

  const onSidebarStyleChange = async (value: SidebarVariant | "") => {
    if (!value) return;
    setSidebarVariant(value);
    applySidebarVariant(value);
    persistPreference("sidebar_variant", value);
  };

  const onSidebarCollapseModeChange = async (value: SidebarCollapsible | "") => {
    if (!value) return;
    setSidebarCollapsible(value);
    applySidebarCollapsible(value);
    persistPreference("sidebar_collapsible", value);
  };

  const onFontChange = async (value: FontKey | "") => {
    if (!value) return;
    applyFont(value);
    setFont(value);
    persistPreference("font", value);
  };

  const handleRestore = () => {
    onThemePresetChange(PREFERENCE_DEFAULTS.theme_preset);
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode);
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout);
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style);
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant);
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible);
    onFontChange(PREFERENCE_DEFAULTS.font);
    onPanelZoomChange(90);
    onScanPreferenceChange("qwen");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">Preferences</h4>
            <p className="text-muted-foreground text-xs">Customize your dashboard layout preferences.</p>
          </div>
          <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Preset</Label>
              <Select value={themePreset} onValueChange={onThemePresetChange}>
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THEME_PRESET_OPTIONS.map((preset) => (
                      <SelectItem key={preset.value} className="text-xs" value={preset.value}>
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              (resolvedThemeMode ?? "light") === "dark" ? preset.primary.dark : preset.primary.light,
                          }}
                        />
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Font switcher RETIRED (design 6/7): brand type = Geist. The fonts
              registry/store/boot wiring is intact — restore this block to bring
              the picker back. Restore button still resets font → Geist. */}

            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Mode</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={themeMode}
                onValueChange={onThemeModeChange}
              >
                <ToggleGroupItem value="light" aria-label="Toggle light">
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Toggle dark">
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" aria-label="Toggle system">
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Page Layout</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={contentLayout}
                onValueChange={onContentLayoutChange}
              >
                <ToggleGroupItem value="centered" aria-label="Toggle centered">
                  Centered
                </ToggleGroupItem>
                <ToggleGroupItem value="full-width" aria-label="Toggle full-width">
                  Full Width
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Navbar Behavior</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={navbarStyle}
                onValueChange={onNavbarStyleChange}
              >
                <ToggleGroupItem value="sticky" aria-label="Toggle sticky">
                  Sticky
                </ToggleGroupItem>
                <ToggleGroupItem value="scroll" aria-label="Toggle scroll">
                  Scroll
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Sidebar Style</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={variant}
                onValueChange={onSidebarStyleChange}
              >
                <ToggleGroupItem value="inset" aria-label="Toggle inset">
                  Inset
                </ToggleGroupItem>
                <ToggleGroupItem value="sidebar" aria-label="Toggle sidebar">
                  Sidebar
                </ToggleGroupItem>
                <ToggleGroupItem value="floating" aria-label="Toggle floating">
                  Floating
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Sidebar Collapse Mode</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={collapsible}
                onValueChange={onSidebarCollapseModeChange}
              >
                <ToggleGroupItem value="icon" aria-label="Toggle icon">
                  Icon
                </ToggleGroupItem>
                <ToggleGroupItem value="offcanvas" aria-label="Toggle offcanvas">
                  OffCanvas
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* ── Panel Zoom ────────────────────────────── */}
            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-xs">Panel Zoom</Label>
                <span className="tabular-nums font-semibold text-[11px] text-muted-foreground">{panelZoom}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7 shrink-0"
                  disabled={panelZoom <= ZOOM_STEPS[0]}
                  onClick={() => {
                    const i = ZOOM_STEPS.indexOf(panelZoom);
                    if (i > 0) onPanelZoomChange(ZOOM_STEPS[i - 1]);
                  }}
                  aria-label="Decrease panel zoom"
                >
                  <Minus className="size-3" aria-hidden="true" />
                </Button>
                <div className="flex flex-1 items-center gap-0.5">
                  {ZOOM_STEPS.map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => onPanelZoomChange(step)}
                      title={`${step}%`}
                      className={[
                        "h-1.5 flex-1 rounded-full transition-all",
                        step === panelZoom
                          ? "bg-primary scale-y-[1.8]"
                          : step < panelZoom
                            ? "bg-primary/40"
                            : "bg-border",
                      ].join(" ")}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7 shrink-0"
                  disabled={panelZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  onClick={() => {
                    const i = ZOOM_STEPS.indexOf(panelZoom);
                    if (i < ZOOM_STEPS.length - 1) onPanelZoomChange(ZOOM_STEPS[i + 1]);
                  }}
                  aria-label="Increase panel zoom"
                >
                  <Plus className="size-3" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/55">Adjusts the stop detail panel density.</p>
            </div>

            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <Label className="font-medium text-xs">Scan Preference</Label>
              <Select value={scanPreference} onValueChange={onScanPreferenceChange}>
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue placeholder="Scanner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem className="text-xs" value="qwen">
                      Qwen Local
                    </SelectItem>
                    <SelectItem className="text-xs" value="openai">
                      OpenAI
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/55">Controls the AI scanner used for label OCR.</p>
            </div>

            <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={handleRestore}>
              Restore Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
