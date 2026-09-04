# Términos de uso (borrador) / Terms of use (draft)

Estado: **borrador para el MVP**. No es asesoramiento legal.
Status: **draft for MVP**. Not legal advice.

1. **Titularidad.** Solo subes o pegas contenido que posees o estás autorizado a procesar.
   **Ownership.** You only upload or paste content you own or are authorized to process.
2. **No fraude.** Prohibido usar el servicio para fraude académico, eludir obligaciones de transparencia o presentar salida limpia como «escrita por un humano» ante un requisito de revelación.
   **No fraud.** Do not use the service for academic fraud, to evade disclosure duties, or to present cleaned output as “human-written” where disclosure is required.
3. **Sin garantías de indetectabilidad.** La Capa A y el strip de metadatos son verificables. Las marcas estadísticas (Claude/Anthropic, Kirchenbauer, SynthID-Text) **no** se certifican como eliminadas. Nunca «Anthropic watermark guaranteed removed».
   **No undetectability warranty.** Layer A and metadata strip are verifiable. Statistical marks are **not** certified removed. Never “Anthropic watermark guaranteed removed”.
4. **Retención.** El MVP en el navegador no sube archivos. En v1, el Worker/Contenedor procesa en memoria/tmp efímero y no persiste el archivo salvo que R2 (v1.5) esté activo para transferencias grandes, con TTL corto.
   **Retention.** Browser MVP does not upload. v1 processes in ephemeral memory/tmp and does not persist files unless R2 (v1.5) is enabled for large transfers, with a short TTL.
5. **Límites.** Tamaño, cadencia (rate limit) y clave Bearer opcional se aplican en el Worker. El API del cleaner **no** lleva CORS `*`.
   **Limits.** Size, rate limits, and an optional bearer key are enforced on the Worker. The cleaner API does **not** ship wildcard CORS.
6. **Upstream.** El motor de limpieza de servidor es [watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) (MIT). FocAIRemover no está afiliado a Anthropic ni al demo [unmark-web](https://github.com/ivanusto/unmark-web).
   **Upstream.** Server-side cleaning is [watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) (MIT). FocAIRemover is not affiliated with Anthropic or [unmark-web](https://github.com/ivanusto/unmark-web).
