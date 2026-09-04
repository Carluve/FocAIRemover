# Términos de uso (borrador) / Terms of use (draft)

Estado: **borrador**. No es asesoramiento legal. El descargo vinculante está en [DISCLAIMER.md](DISCLAIMER.md) y **no** se suaviza aquí.

Status: **draft**. Not legal advice. Binding disclaimer: [DISCLAIMER.md](DISCLAIMER.md).

0. **Investigación.** FocAIRemover es un proyecto de investigación / experimental. No es un producto comercial ni un servicio con garantía o SLA.
   **Research.** Not a commercial product and not a guaranteed service.
1. **Titularidad.** Solo subes o pegas contenido que posees o estás autorizado a procesar.
   **Ownership.** You only upload or paste content you own or are authorized to process.
2. **No fraude.** Prohibido usar la herramienta para fraude académico, eludir obligaciones de transparencia o presentar salida limpia como «escrita por un humano» ante un requisito de revelación.
   **No fraud.** Do not use it for academic fraud, to evade disclosure duties, or to present cleaned output as “human-written” where disclosure is required.
3. **Sin garantías de indetectabilidad.** La Capa A y el strip de metadatos son verificables a nivel técnico. Las marcas estadísticas (Claude/Anthropic, Kirchenbauer, SynthID-Text) **no** se certifican como eliminadas. Nunca «Anthropic watermark guaranteed removed». Un informe «limpio» no te protege ante un detector, una universidad o un tribunal.
   **No undetectability warranty.** Never “Anthropic watermark guaranteed removed”.
4. **Datos: pueden guardarse.** No asumas «todo local y se borra al instante».
   - **MVP R2:** cada upload va a `focairemover-files` (`uploads/{jobId}/original`, `cleaned`, `report.json`) más la fila D1. **Pueden** retenerse para investigación u operación.
   - **Cleaner (Container o CLEANER_URL):** el fichero se envía a `/clean`. El tmp del contenedor no es una promesa de no retención.
   - **Capa B futura:** R2 y el proveedor del modelo **pueden** retener texto. Un TTL, si existe, no es un derecho del usuario.
   Tabla: [PLAN.md — Datos por fase](PLAN.md#datos-por-fase--data-by-phase).
5. **Descargo.** El autor y el proyecto no responden del limpieado, de watermarks residuales, de tu uso, de daños, pérdidas, sanciones ni de fallos. Software **AS IS**. [DISCLAIMER.md](DISCLAIMER.md).
   **Disclaimer.** No liability. **AS IS.**
6. **Límites.** Tamaño, cadencia (rate limit) y clave Bearer opcional se aplican en el Worker. El API del cleaner **no** lleva CORS `*`.
   **Limits.** Size, rate limits, optional bearer key. No wildcard CORS on the cleaner API.
7. **Upstream.** El motor de limpieza de servidor es [watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) (MIT). FocAIRemover no está afiliado a Anthropic ni a [unmark-web](https://github.com/ivanusto/unmark-web).
   **Upstream.** Server-side cleaning is watermarks-remover (MIT). Not affiliated with Anthropic or unmark-web.
