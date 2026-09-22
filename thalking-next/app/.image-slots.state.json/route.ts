import { NextResponse } from 'next/server';

/**
 * The <image-slot> component fetches this sidecar (document-relative) to
 * hydrate any user-dropped images. The original artifact had none, so we
 * serve an empty state — the component then shows its placeholder framing,
 * matching the standalone HTML exactly. Serving 200 here (instead of letting
 * it 404) keeps the console clean.
 */
export function GET() {
  return NextResponse.json({});
}
