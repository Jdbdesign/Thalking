'use client';

import { useEffect, useRef } from 'react';
import { TEMPLATE_HTML } from './template';

/**
 * Rotates the two hero-card phone numbers through a small pool to hint that
 * many UK/US numbers are available. Deliberately self-contained:
 *  - touches ONLY the #th-hero-uk-num / #th-hero-us-num text nodes (no React
 *    state, no dc-runtime re-render), so nothing else on the page is affected;
 *  - fades via the CSS opacity/transform transition already on those spans,
 *    so the swap is smooth and never reflows the layout (numbers are same-ish
 *    width in the monospace font);
 *  - guards against duplicate timers across HMR / re-mounts via a window flag;
 *  - pauses while the tab is hidden and stops cleanly on teardown.
 * Returns a cleanup function.
 */
function startHeroNumberRotation(): () => void {
  const W = window as unknown as { __thHeroRotator?: boolean };
  if (W.__thHeroRotator) return () => {};
  W.__thHeroRotator = true;

  const UK = [
    '+44 7123 456789',
    '+44 20 7946 0958',
    '+44 161 850 2274',
    '+44 7700 900321',
    '+44 121 496 0812',
  ];
  const US = [
    '+1 347 876 5432',
    '+1 415 555 0192',
    '+1 212 555 0148',
    '+1 646 555 0177',
    '+1 305 555 0263',
  ];

  let ukEl: HTMLElement | null = null;
  let usEl: HTMLElement | null = null;
  let i = 0;
  let swapTimer: number | undefined;
  let settleTimer: number | undefined;
  let pollTimer: number | undefined;
  let stopped = false;

  const fadeSwap = (el: HTMLElement | null, text: string) => {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    settleTimer = window.setTimeout(() => {
      if (stopped) return;
      el.textContent = text;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 360);
  };

  const tick = () => {
    if (stopped || document.hidden) return;
    i = (i + 1) % Math.min(UK.length, US.length);
    fadeSwap(ukEl, UK[i]);
    fadeSwap(usEl, US[i]);
  };

  const begin = () => {
    ukEl = document.getElementById('th-hero-uk-num');
    usEl = document.getElementById('th-hero-us-num');
    if (!ukEl || !usEl) return false;
    swapTimer = window.setInterval(tick, 2600);
    return true;
  };

  // dc-runtime renders asynchronously after scripts load; poll briefly for the
  // hero spans, then start. Give up after ~15s so we never leak a poller.
  let tries = 0;
  pollTimer = window.setInterval(() => {
    tries++;
    if (begin() || tries > 60) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }, 250);

  return () => {
    stopped = true;
    if (swapTimer) window.clearInterval(swapTimer);
    if (pollTimer) window.clearInterval(pollTimer);
    if (settleTimer) window.clearTimeout(settleTimer);
    W.__thHeroRotator = false;
  };
}

/**
 * Currency converter for the top-nav selector (#th-currency). Converts the
 * pricing figures (.th-price) into the visitor's currency.
 *  - Live rates from the free, key-less open.er-api.com endpoint (base USD),
 *    with a baked-in fallback table so it still works offline / if the API is
 *    down.
 *  - Default currency guessed from the browser locale/region (no geo-IP call).
 *  - Self-contained: only touches #th-currency and .th-price nodes; guarded
 *    against duplicate init across HMR / re-mounts. Returns a cleanup fn.
 */
function startCurrencyConverter(): () => void {
  const W = window as unknown as { __thCurrency?: boolean };
  if (W.__thCurrency) return () => {};
  W.__thCurrency = true;

  // Region rows: id (used as region badge, 'GL' for Global), name, currency.
  type Region = { id: string; name: string; ccy: string };
  const REGIONS: Region[] = [
    { id: 'GL', name: 'Global', ccy: 'GBP' },
    { id: 'GB', name: 'United Kingdom', ccy: 'GBP' },
    { id: 'US', name: 'United States', ccy: 'USD' },
    { id: 'EU', name: 'European Union', ccy: 'EUR' },
    { id: 'CA', name: 'Canada', ccy: 'CAD' },
    { id: 'AU', name: 'Australia', ccy: 'AUD' },
    { id: 'IN', name: 'India', ccy: 'INR' },
    { id: 'NG', name: 'Nigeria', ccy: 'NGN' },
    { id: 'ZA', name: 'South Africa', ccy: 'ZAR' },
    { id: 'GH', name: 'Ghana', ccy: 'GHS' },
    { id: 'AE', name: 'United Arab Emirates', ccy: 'AED' },
    { id: 'JP', name: 'Japan', ccy: 'JPY' },
    { id: 'KE', name: 'Kenya', ccy: 'KES' },
  ];
  const SYMBOL: Record<string, string> = {
    USD: '$', GBP: '£', EUR: '€', NGN: '₦', CAD: 'C$', AUD: 'A$',
    INR: '₹', ZAR: 'R', GHS: '₵', AED: 'AED ', JPY: '¥', KES: 'KSh ',
  };
  // Rates relative to USD (fallback if the live fetch fails). Approximate.
  let ratesUSD: Record<string, number> = {
    USD: 1, GBP: 0.79, EUR: 0.92, NGN: 1550, CAD: 1.36, AUD: 1.52,
    INR: 83, ZAR: 18.5, GHS: 15, AED: 3.67, JPY: 156, KES: 129,
  };

  const guessRegionId = (): string => {
    try {
      const loc = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      const region = loc.split('-')[1]?.toUpperCase();
      if (region && REGIONS.some((r) => r.id === region)) return region;
    } catch {}
    return 'GL';
  };

  const fmt = (n: number, code: string): string => {
    const noDec = code === 'JPY' || code === 'NGN' || code === 'KES';
    const num = noDec ? Math.round(n) : Math.round(n * 100) / 100;
    const s = noDec
      ? num.toLocaleString('en-US')
      : num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (SYMBOL[code] || '') + s;
  };
  const convert = (amount: number, base: string, target: string): number =>
    (amount / (ratesUSD[base] ?? 1)) * (ratesUSD[target] ?? 1);

  let trigger: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  let currentId = 'GL';
  let open = false;
  let pollTimer: number | undefined;
  let stopped = false;

  const applyPrices = (ccy: string) => {
    document.querySelectorAll<HTMLElement>('.th-price').forEach((el) => {
      const amount = parseFloat(el.dataset.thAmount || '0');
      const base = el.dataset.thBase || 'USD';
      const prefix = el.dataset.thPrefix || '';
      el.textContent = prefix + fmt(convert(amount, base, ccy), ccy);
    });
  };

  const renderList = () => {
    if (!list) return;
    list.innerHTML = '';
    for (const r of REGIONS) {
      const active = r.id === currentId;
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.dataset.id = r.id;
      row.style.cssText =
        'width:100%;display:flex;align-items:center;gap:11px;padding:9px 10px;border:none;border-radius:10px;cursor:pointer;text-align:left;font-family:inherit;transition:background .14s;background:' +
        (active ? '#F2F1FF' : 'transparent');
      const badge = r.id === 'GL'
        ? '<span style="width:26px;height:26px;border-radius:50%;background:#EDE9FE;display:grid;place-items:center;flex-shrink:0"><svg width="15" height="15" viewBox="0 0 24 24" stroke="#7C3AED" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"></path></svg></span>'
        : '<span style="width:26px;height:26px;border-radius:7px;background:#F2F3F8;display:grid;place-items:center;flex-shrink:0;font-family:\'Plus Jakarta Sans\',sans-serif;font-size:9.5px;font-weight:800;color:#6B7189;letter-spacing:.02em">' + r.id + '</span>';
      row.innerHTML =
        badge +
        '<span style="flex:1;min-width:0;font-family:\'Plus Jakarta Sans\',sans-serif;font-size:13.5px;font-weight:' + (active ? '700' : '600') + ';color:' + (active ? '#4B2AA8' : '#0B1020') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.name + '</span>' +
        '<span style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:12.5px;font-weight:700;color:' + (active ? '#7C3AED' : '#A2A8BC') + ';flex-shrink:0">' + r.ccy + '</span>';
      row.addEventListener('mouseenter', () => { if (r.id !== currentId) row.style.background = '#F6F7FB'; });
      row.addEventListener('mouseleave', () => { if (r.id !== currentId) row.style.background = 'transparent'; });
      row.addEventListener('click', () => { select(r.id); closePanel(); });
      list.appendChild(row);
    }
  };

  const select = (id: string) => {
    const r = REGIONS.find((x) => x.id === id) || REGIONS[0];
    currentId = r.id;
    if (label) label.textContent = r.ccy;
    applyPrices(r.ccy);
    renderList();
    try { localStorage.setItem('th-region', r.id); } catch {}
  };

  const openPanel = () => {
    if (!panel || !trigger) return;
    panel.style.display = 'flex';
    trigger.setAttribute('aria-expanded', 'true');
    open = true;
    // keep the active row in view
    const act = list?.querySelector<HTMLElement>('[data-id="' + currentId + '"]');
    if (act) act.scrollIntoView({ block: 'nearest' });
  };
  const closePanel = () => {
    if (!panel || !trigger) return;
    panel.style.display = 'none';
    trigger.setAttribute('aria-expanded', 'false');
    open = false;
  };

  const onDocClick = (e: MouseEvent) => {
    const wrap = document.getElementById('th-currency-wrap');
    if (open && wrap && !wrap.contains(e.target as Node)) closePanel();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) closePanel(); };

  const init = () => {
    trigger = document.getElementById('th-currency-trigger');
    panel = document.getElementById('th-currency-panel');
    list = document.getElementById('th-currency-list');
    label = document.getElementById('th-currency-label');
    if (!trigger || !panel || !list || !label) return false;

    let saved = '';
    try { saved = localStorage.getItem('th-region') || ''; } catch {}
    currentId = saved && REGIONS.some((r) => r.id === saved) ? saved : guessRegionId();

    renderList();
    select(currentId);

    trigger.addEventListener('click', (e) => { e.stopPropagation(); open ? closePanel() : openPanel(); });
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (stopped || !j || j.result !== 'success' || !j.rates) return;
        for (const code of Object.keys(ratesUSD)) {
          if (typeof j.rates[code] === 'number') ratesUSD[code] = j.rates[code];
        }
        const r = REGIONS.find((x) => x.id === currentId) || REGIONS[0];
        applyPrices(r.ccy);
      })
      .catch(() => {});
    return true;
  };

  let tries = 0;
  pollTimer = window.setInterval(() => {
    tries++;
    if (init() || tries > 60) { window.clearInterval(pollTimer); pollTimer = undefined; }
  }, 250);

  return () => {
    stopped = true;
    if (pollTimer) window.clearInterval(pollTimer);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    W.__thCurrency = false;
  };
}

/**
 * Animates the 5 green call markers on the International-calling globe: they
 * fade out together, hop to a fresh set of positions across the globe, and
 * fade back in — a continuous loop suggesting live calls worldwide. Purely
 * decorative and self-contained (only touches #th-globe-markers .th-gm), so it
 * can't affect anything else. Guarded against duplicate timers; cleans up.
 */
function startGlobeMarkers(): () => void {
  const W = window as unknown as { __thGlobeMarkers?: boolean };
  if (W.__thGlobeMarkers) return () => {};
  W.__thGlobeMarkers = true;

  // Candidate positions (left%, top%) spread over the visible globe disc.
  const POOL: Array<[number, number]> = [
    [34, 30], [58, 24], [48, 52], [68, 60], [30, 66],
    [44, 22], [62, 40], [38, 46], [72, 34], [52, 70],
    [28, 42], [56, 62], [42, 36], [66, 48], [50, 28],
    [36, 58], [60, 30], [46, 64], [70, 52], [32, 50],
  ];

  let els: HTMLElement[] = [];
  const key = (p: [number, number]) => p[0] + ',' + p[1];
  let occupied = new Set<string>();          // positions currently taken by a marker
  let cycleTimer: number | undefined;
  let pollTimer: number | undefined;
  let stopped = false;

  const freePositions = () => POOL.filter((p) => !occupied.has(key(p)));

  // Move ONE marker: fade it out, then (while invisible) relocate it to a free
  // slot and fade it back in. Nothing slides — position only changes at 0 opacity.
  const hopOne = (el: HTMLElement) => {
    const prev = el.dataset.pos;             // free its current slot after it hides
    el.classList.remove('is-on');            // fade out (0.6s)
    window.setTimeout(() => {
      if (stopped) return;
      if (prev) occupied.delete(prev);
      const free = freePositions();
      if (free.length) {
        const p = free[Math.floor(Math.random() * free.length)];
        el.style.left = p[0] + '%';
        el.style.top = p[1] + '%';
        el.dataset.pos = key(p);
        occupied.add(key(p));
      }
      // next frame so the browser registers the new (invisible) position first
      window.setTimeout(() => { if (!stopped) el.classList.add('is-on'); }, 40);
    }, 650);
  };

  const cycle = () => {
    if (stopped || document.hidden) { cycleTimer = window.setTimeout(cycle, 1800); return; }
    // hop 1 or 2 markers this round (randomly), staggered so it's never all-at-once
    const n = Math.random() < 0.4 ? 2 : 1;
    const shuffled = els.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n && i < shuffled.length; i++) {
      const el = shuffled[i];
      window.setTimeout(() => { if (!stopped) hopOne(el); }, i * 500); // stagger the two
    }
    cycleTimer = window.setTimeout(cycle, 2200); // steady rhythm, one/two at a time
  };

  const initialPlace = () => {
    occupied = new Set();
    const a = POOL.slice().sort(() => Math.random() - 0.5).slice(0, els.length);
    els.forEach((el, i) => {
      el.style.left = a[i][0] + '%';
      el.style.top = a[i][1] + '%';
      el.dataset.pos = key(a[i]);
      occupied.add(key(a[i]));
      el.classList.add('is-on');
    });
  };

  let tries = 0;
  pollTimer = window.setInterval(() => {
    tries++;
    els = Array.from(document.querySelectorAll<HTMLElement>('#th-globe-markers .th-gm'));
    if (els.length >= 1) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
      initialPlace();                        // all 5 shown at their spots
      cycleTimer = window.setTimeout(cycle, 2600);
    } else if (tries > 60) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }, 250);

  return () => {
    stopped = true;
    if (cycleTimer) window.clearTimeout(cycleTimer);
    if (pollTimer) window.clearInterval(pollTimer);
    W.__thGlobeMarkers = false;
  };
}

/**
 * Renders the original Thalking page by reusing its own template + logic with
 * the dc-runtime engine — the same pipeline the standalone artifact used, so
 * the content, layout, and every interaction are preserved exactly.
 *
 * Flow:
 *  1. Inject the <x-dc> template block + <script data-dc-script> logic into the
 *     mount node (dc-runtime's boot() locates them via document.querySelector).
 *  2. Load React + ReactDOM UMD (they register window.React / window.ReactDOM),
 *     then load dc-runtime.js, which compiles the template, evaluates the logic
 *     class, replaces <x-dc> with <div id="dc-root">, and mounts the React tree.
 */
export default function ThalkingApp() {
  const mountRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const mount = mountRef.current;
    if (!mount) return;

    // 1. Inject the template markup. Parse it first inside a <template>
    //    element: its .content is an inert DocumentFragment, so the raw
    //    {{ ... }} interpolations sitting in SVG `d` / other attributes are
    //    NOT validated or rendered by the browser (no console noise), and any
    //    <script> tags are inert. We then adopt those nodes into a hidden
    //    holder in the live document so dc-runtime's document.querySelector
    //    for <x-dc> and <script data-dc-script> still finds them, and compile
    //    them into the real React tree.
    const holder = document.createElement('div');
    holder.setAttribute('data-thalking-root', '');
    holder.style.display = 'none'; // hide the raw template until boot swaps it

    const parser = document.createElement('template');
    parser.innerHTML = TEMPLATE_HTML;
    holder.appendChild(parser.content);
    mount.appendChild(holder);

    // dc-runtime reveals #dc-root itself; drop our hide once it has booted.
    const reveal = () => {
      holder.style.display = '';
    };

    function loadScript(src: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          `script[data-thalking-src="${src}"]`
        );
        if (existing) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.setAttribute('data-thalking-src', src);
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('failed to load ' + src));
        document.head.appendChild(s);
      });
    }

    let cancelled = false;
    let stopRotation: (() => void) | undefined;
    let stopGlobe: (() => void) | undefined;
    let stopCurrency: (() => void) | undefined;
    (async () => {
      // React + ReactDOM must exist on window before dc-runtime boots.
      await loadScript('/dc/react.production.min.js');
      await loadScript('/dc/react-dom.production.min.js');
      if (cancelled) return;
      // dc-runtime boots immediately on load (document is already interactive),
      // finds <x-dc> inside our mount, and renders into #dc-root.
      await loadScript('/dc/dc-runtime.js');
      reveal();
      // Start the lively hero number rotation + globe call markers once mounting.
      if (!cancelled) stopRotation = startHeroNumberRotation();
      if (!cancelled) stopGlobe = startGlobeMarkers();
      if (!cancelled) stopCurrency = startCurrencyConverter();
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[thalking] boot failed:', err);
    });

    return () => {
      cancelled = true;
      if (stopRotation) stopRotation();
      if (stopGlobe) stopGlobe();
      if (stopCurrency) stopCurrency();
    };
  }, []);

  return <div ref={mountRef} />;
}
