const HONEST_NOTE =
  "Layer A and metadata stripping are verifiable. Statistical text watermarks are not certified removed. Never: Anthropic watermark guaranteed removed.";

export function honestNote(): string {
  return HONEST_NOTE;
}

export function summarizeReport(kind: string, report: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind,
    note: HONEST_NOTE,
  };
  if (report && typeof report === "object") {
    const r = report as Record<string, unknown>;
    if ("actions" in r) out.actions = r.actions;
    if ("suspicious" in r) out.suspicious = r.suspicious;
    if ("layer_b" in r) out.layer_b = r.layer_b;
    if ("still_has_c2pa" in r) out.still_has_c2pa = r.still_has_c2pa;
    if ("still_has_ai_metadata" in r) out.still_has_ai_metadata = r.still_has_ai_metadata;
    if ("removedCount" in r) out.removedCount = r.removedCount;
    if ("removed" in r) out.removed = r.removed;
    if ("backend" in r) out.backend = r.backend;
    if ("layer" in r) out.layer = r.layer;
  }
  return out;
}
