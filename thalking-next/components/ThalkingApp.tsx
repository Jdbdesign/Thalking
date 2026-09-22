'use client';

import { useEffect, useRef } from 'react';
import { TEMPLATE_HTML } from './template';

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
    (async () => {
      // React + ReactDOM must exist on window before dc-runtime boots.
      await loadScript('/dc/react.production.min.js');
      await loadScript('/dc/react-dom.production.min.js');
      if (cancelled) return;
      // dc-runtime boots immediately on load (document is already interactive),
      // finds <x-dc> inside our mount, and renders into #dc-root.
      await loadScript('/dc/dc-runtime.js');
      reveal();
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[thalking] boot failed:', err);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={mountRef} />;
}
