# Ética / Ethics

FocAIRemover es un **proyecto de investigación / experimental**, no un producto comercial. Hereda la política de uso previsto de
[watermarks-remover ethics.md](https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/references/ethics.md)
(MIT). El descargo de responsabilidad (sin suavizar) está en [DISCLAIMER.md](DISCLAIMER.md).

FocAIRemover is a **research / experimental** project, not a commercial product. It inherits upstream intended-use notes. Binding liability text: [DISCLAIMER.md](DISCLAIMER.md).

## Uso previsto / Intended use

Procesar contenido **que el usuario posee o está autorizado a procesar**.
Process content **the user owns or is authorized to process**.

### Apropiado / Appropriate

- Investigación: entender marcas de texto y C2PA entre proveedores.
- Privacidad *en tu propio material*: quitar procedencia de herramienta/dispositivo/IA de *tus* archivos.
- Higiene de ingeniería: Unicode invisible que rompe diffs, búsqueda o pegado.
- Borradores propios donde la política local permite copias sin marcar.

- Research: understand text and C2PA marks across vendors.
- Privacy *on your own material*: strip tool/device/AI provenance from *your* files.
- Engineering hygiene: invisible Unicode that breaks diffs, search, or paste.
- Cleaning your own drafts where policy allows unmarked local copies.

### No apropiado / Not appropriate

- Fraude académico o ocultar asistencia de IA donde hay obligación de revelarla.
- Eludir reglas legales de transparencia o de plataforma.
- Afirmar que el contenido limpio es «escrito por un humano» para teatro de cumplimiento.
- Tratar FocAIRemover como un servicio profesional, certificado o con garantía de indetectabilidad.

- Academic fraud or misrepresenting AI assistance where disclosure is required.
- Circumventing lawful transparency or platform disclosure rules.
- Claiming cleaned content is “human-written” for compliance theater.
- Treating FocAIRemover as a professional, certified, or undetectability-guaranteed service.

## Datos / Data

Los datos **pueden guardarse**. El MVP sube **cada fichero a R2** (`focairemover-files`, cuenta enterprise). Originales, cleaned e informes pueden retenerse. **No** asumas borrado al instante. Tabla: [PLAN.md — Datos por fase](PLAN.md#datos-por-fase--data-by-phase).

**Data may be stored.** Every upload goes to R2 and **may be kept**.

## Honestidad en los informes / Honesty in reports

Una marca eliminada **no** significa que el contenido nunca fue asistido por IA.

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

El autor y el proyecto **no se hacen responsables de nada**: resultado del limpieado, watermarks que sigan detectables, uso del usuario, daños, pérdidas, sanciones académicas o legales, fallos del servicio. Software **«tal cual» / AS IS**, sin garantías. Texto completo, sin suavizar: [DISCLAIMER.md](DISCLAIMER.md). También [TOS.md](TOS.md).

The author and the project **accept no responsibility whatsoever**. **AS IS**, no warranties. Full text: [DISCLAIMER.md](DISCLAIMER.md).
