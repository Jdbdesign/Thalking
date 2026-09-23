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
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[thalking] boot failed:', err);
    });

    return () => {
      cancelled = true;
      if (stopRotation) stopRotation();
      if (stopGlobe) stopGlobe();
    };
  }, []);

  return <div ref={mountRef} />;
}
