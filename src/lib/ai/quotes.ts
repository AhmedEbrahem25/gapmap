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
