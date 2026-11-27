const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every evidence quote must appear verbatim in the transcription, or it is dropped. */
export function validateQuote(transcription: string, quote: string): string {
  if (!quote) return "";
  const q = normalise(quote.replace(/^["“”']+|["“”']+$/g, ""));
  if (!q) return "";
  const flat = transcription.replace(/\s+/g, " ");
  const idx = flat.toLowerCase().indexOf(q);
  return idx >= 0 ? flat.slice(idx, idx + q.length) : "";
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

/**
 * An explanation counts as cited only if it names the slide it was given and stays close to
 * that slide's text: at least 40% of its content words (and at least two) appear on the slide.
 */
export function isGroundedIn(explanation: string, slideText: string): boolean {
  const ex = words(explanation);
  if (!ex.size) return false;
  const slide = words(slideText);
  const hits = [...ex].filter((w) => slide.has(w)).length;
  return hits >= 2 && hits / ex.size >= 0.4;
}

/** "L4 p.11" — the label the AI must use to cite a slide. */
export const slideLabel = (lecture: number, page: number) => `L${lecture} p.${page}`;
