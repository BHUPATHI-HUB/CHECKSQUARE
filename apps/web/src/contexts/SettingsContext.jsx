import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULT_WEIGHTS, DEFAULT_SCORE_EXPLANATION_HTML, PROPCHK_WEIGHTS, PROPCHK_ITEMS_PER_ROOM, DEFAULT_ROOM_SCORE_EXPR, DEFAULT_PRIORITY_EXPR } from '@/utils/scoring';
import { STARTER_COMMENT_LIBRARY } from '@/utils/commentLibrary';

const SettingsContext = createContext(null);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Helper to convert HEX to HSL for Tailwind CSS variables
const hexToHSL = (hex) => {
  let r = 0, g = 0, b = 0;
  if (!hex) return '0 0% 0%';
  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }
  r /= 255; g /= 255; b /= 255;
  let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin, h = 0, s = 0, l = 0;
  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);
  return `${h} ${s}% ${l}%`;
};

const defaultDisclaimer1 = `<h3>1. SCOPE OF INSPECTION</h3><p>The purpose of this inspection is to identify visual, major defects or material issues in the specified systems and components of the property...</p>`;
const defaultDisclaimer2 = `<h3>4. LIMITATION OF LIABILITY</h3><p>The Inspector assumes no liability for the cost of repair or replacement of unreported defects or deficiencies...</p>`;

export const SettingsProvider = ({ children }) => {
  const defaultSettings = {
    appName: 'CheckSquare',
    companyName: 'CHECK SQUARE',
    companyTagline: 'Check Right. Live Safe.',
    companySubtitle: 'HOME INSPECTION SERVICES',
    logo: null,
    customLogo: null, 
    favicon: null,
    address: '123 Inspector Way, Suite 100, Cityville, ST 12345',
    phone: '+91 8074693950',
    companyEmail: 'checksqr@gmail.com',
    companyPhone1: '+91 8074693950',
    companyPhone2: '',
    disclaimerPage1: defaultDisclaimer1,
    disclaimerPage2: defaultDisclaimer2,
    footer: 'Thank you for choosing CheckSquare. We appreciate your business.',
    primaryColor: '#2DB4C6', 
    primaryBrandColor: '#2DB4C6',
    secondaryColor: '#1A8A9A', 
    secondaryBrandColor: '#1A8A9A',
    accentColor: '#E0F4F7', 
    patternColor: '#4b6176', 
    commentLibrary: STARTER_COMMENT_LIBRARY,
    severityLevels: [
      { id: 'major',    name: 'Major',    definition: 'Compromises safety, structure or habitability.', color: '#dc2626' },
      { id: 'minor',    name: 'Minor',    definition: 'No immediate risk; preventive maintenance needed.', color: '#f97316' },
      { id: 'cosmetic', name: 'Cosmetic', definition: 'Surface / aesthetic only.', color: '#eab308' },
    ],
    // Admin-editable hardware brand catalog. Categories are top-level keys.
    // Inspector toggles brands on-site and may also attach a photo per brand.
    brandCatalog: {
      'Switchboards': ['Legrand', 'Schneider Electric', 'Anchor', 'Havells', 'Crabtree'],
      'Plumbing':     ['Kohler', 'Jaquar', 'Hindware', 'Cera', 'Grohe', 'Roca'],
      'Appliances':   ['Whirlpool', 'GE', 'LG', 'Samsung', 'Bosch', 'IFB'],
      'Tiles':        ['Kajaria', 'Somany', 'Asian Granito', 'Nitco', 'Johnson'],
      'Paints':       ['Asian Paints', 'Berger', 'Nerolac', 'Dulux'],
    },
    // Admin-editable legal / informational pages. Rendered as raw HTML.
    privacyPolicy: '<h2>Privacy Policy</h2><p>Last updated: enter date here.</p><p>This is the default privacy policy. The admin can edit this content from the Admin Settings page.</p>',
    termsOfService: '<h2>Terms of Service</h2><p>Last updated: enter date here.</p><p>This is the default terms of service. The admin can edit this content from the Admin Settings page.</p>',
    aboutInfo: '<h2>About CheckSquare</h2><p>CheckSquare is a property inspection management platform. The admin can replace this copy from Admin Settings.</p>',
    // Inspection scoring system — admin-configurable (PropChk severity model)
    scoring: {
      enabled: true,
      weights: { ...PROPCHK_WEIGHTS },
      itemsPerRoom: PROPCHK_ITEMS_PER_ROOM,
      roomScoreExpr: DEFAULT_ROOM_SCORE_EXPR,
      priorityExpr:  DEFAULT_PRIORITY_EXPR,
      explanation: DEFAULT_SCORE_EXPLANATION_HTML,
    },
    // Per-section ordering & toggles for the customer PDF / DOCX export.
    // Stored as an ordered array so the admin can drag pages up / down
    // and insert custom sections. Built-in keys are reserved; custom
    // sections use a `custom:<uuid>` key and carry their own title + HTML.
    reportSections: [
      { key: 'cover',            enabled: true },
      { key: 'propertyDetails',  enabled: true },
      { key: 'score',            enabled: true },
      { key: 'scoreTable',       enabled: true },
      { key: 'disclaimers',      enabled: true },
      { key: 'severityTaxonomy', enabled: true },
      { key: 'areaCalculations', enabled: true },
      { key: 'environmental',    enabled: true },
      { key: 'rooms',            enabled: true },
      { key: 'thankYou',         enabled: true },
      // Closing details (Document of Record + Inspector/Client signatures)
      // rendered at the bottom of the Thank-You page. Toggle off to omit.
      { key: 'signoff',          enabled: true },
    ],
  };

  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  // Bump this whenever the default brand identity changes so stale
  // localStorage copies don't override the new defaults (appName, colors, etc).
  const BRAND_VERSION = 'checksquare-2026-05-v3';
  // Keys that belong to the brand identity — wiped when BRAND_VERSION changes
  // so the new defaults take effect without the user resetting anything else.
  const BRAND_KEYS = [
    'appName', 'companyName', 'companyTagline', 'companySubtitle',
    'companyEmail', 'companyPhone1', 'companyPhone2', 'phone', 'address',
    'primaryColor', 'primaryBrandColor', 'secondaryColor', 'secondaryBrandColor',
    'accentColor', 'patternColor', 'footer', 'aboutInfo',
    'commentLibrary',
  ];

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('app-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.__brandVersion !== BRAND_VERSION) {
          // Drop brand-identity fields so the new defaults win, keep everything
          // else (comment library, scoring weights, disclaimers, etc).
          BRAND_KEYS.forEach((k) => { delete parsed[k]; });
          parsed.__brandVersion = BRAND_VERSION;
          localStorage.setItem('app-settings', JSON.stringify(parsed));
        }
        setSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.error('Failed to parse settings', err);
    } finally {
      setLoading(false);
    }

    // Spec §8 DoD: whitelabel changes cascade across all open tabs without
    // requiring a reload. The `storage` event fires in *other* tabs when
    // localStorage is mutated, so we rehydrate from it.
    const onStorage = (e) => {
      if (e.key !== 'app-settings' || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (err) {
        console.error('Failed to sync settings from storage event', err);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    // Apply dynamic branding variables globally
    const primary = settings.primaryBrandColor || settings.primaryColor;
    const secondary = settings.secondaryBrandColor || settings.secondaryColor;
    
    if (primary) document.documentElement.style.setProperty('--primary', hexToHSL(primary));
    if (secondary) document.documentElement.style.setProperty('--secondary', hexToHSL(secondary));
    if (settings.accentColor) document.documentElement.style.setProperty('--accent', hexToHSL(settings.accentColor));
    
    // Update favicon
    if (settings.favicon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.favicon;
    }
    
    // Update document title fallback
    if (settings.appName) {
      document.title = document.title.includes('-') 
        ? `${document.title.split('-')[0].trim()} - ${settings.appName}`
        : settings.appName;
    }
  }, [settings.primaryBrandColor, settings.primaryColor, settings.secondaryBrandColor, settings.secondaryColor, settings.accentColor, settings.favicon, settings.appName]);

  const updateSettings = (newSettings) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      localStorage.setItem('app-settings', JSON.stringify({
        ...updated,
        __brandVersion: BRAND_VERSION,
        lastUpdated: new Date().toISOString()
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to update settings' };
    }
  };

  const resetDisclaimers = () => {
    const result = updateSettings({ disclaimerPage1: defaultDisclaimer1, disclaimerPage2: defaultDisclaimer2 });
    // Return the freshly-applied defaults alongside the success flag so callers
    // can immediately rehydrate their local form state without waiting for a
    // settings re-read.
    return {
      ...result,
      disclaimerPage1: defaultDisclaimer1,
      disclaimerPage2: defaultDisclaimer2,
    };
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetDisclaimers, loading }}>
      {!loading && children}
    </SettingsContext.Provider>
  );
};
