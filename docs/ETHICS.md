# Ética / Ethics

FocAIRemover hereda la política de uso de
[watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/references/ethics.md)
(MIT). Este archivo la resume y la aplica al producto alojado.

FocAIRemover inherits the intended-use policy of
[watermarks-remover ethics.md](https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/references/ethics.md)
(MIT). This file restates it for the hosted product.

## Uso previsto / Intended use

Procesar contenido **que el usuario posee o está autorizado a procesar**.
Process content **the user owns or is authorized to process**.

### Apropiado / Appropriate

- Privacidad: quitar procedencia de herramienta/dispositivo/IA de *tus* archivos antes de compartirlos.
- Higiene de ingeniería: Unicode invisible que rompe diffs, búsqueda o pegado.
- Investigación: entender marcas de texto y C2PA entre proveedores.
- Borradores propios donde la política local permite copias sin marcar.

- Privacy: strip tool/device/AI provenance from *your* files before sharing.
- Engineering hygiene: invisible Unicode that breaks diffs, search, or paste.
- Research: understand text and C2PA marks across vendors.
- Cleaning your own drafts where policy allows unmarked local copies.

### No apropiado / Not appropriate

- Fraude académico o ocultar asistencia de IA donde hay obligación de revelarla.
- Eludir reglas legales de transparencia o de plataforma.
- Afirmar que el contenido limpio es «escrito por un humano» para teatro de cumplimiento.

- Academic fraud or misrepresenting AI assistance where disclosure is required.
- Circumventing lawful transparency or platform disclosure rules.
- Claiming cleaned content is “human-written” for compliance theater.

## Honestidad en los informes / Honesty in reports

Un marca eliminada **no** significa que el contenido nunca fue asistido por IA.

A removed mark does **not** mean the content was never AI-assisted.

Separar siempre:

1. **Verificable** — recuentos Unicode, acciones de metadatos (C2PA/EXIF/XMP).
2. **Mejor esfuerzo** — reescritura estadística (Capa B). Sin certificado de «indetectable».
3. **Fuera de alcance** — SynthID de píxeles / CtrlRegen (GPU), *soft binding* C2PA, detector oficial de Anthropic (aún no público).

Always separate:

1. **Verifiable** — Unicode counts, metadata actions (C2PA/EXIF/XMP).
2. **Best-effort** — statistical rewrite (Layer B). No gold “undetectable” claim.
3. **Out of scope** — pixel SynthID / CtrlRegen (GPU), C2PA soft binding, official Anthropic detector (not public yet).

**Nunca** afirmar: «marca de agua de Anthropic garantizada como eliminada».
**Never** claim: “Anthropic watermark guaranteed removed”.

## Responsabilidad / Liability

Los desarrolladores de este proyecto y del upstream no asumen responsabilidad por el mal uso. El usuario debe cumplir la normativa local. Ver también [TOS.md](TOS.md).

Upstream and FocAIRemover authors disclaim liability for misuse. Users must follow local law. See also [TOS.md](TOS.md).
