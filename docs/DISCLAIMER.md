# Descargo de responsabilidad / Disclaimer

**Idioma principal: español.** Un párrafo en inglés al final. Este texto prevalece sobre cualquier copy de marketing, README resumido o comentarios en el código que suenen más suaves.

**Primary language: Spanish.** Brief English paragraph at the end. This text prevails over marketing copy, a shorter README, or softer comments in code.

---

## Naturaleza del proyecto

FocAIRemover es un **proyecto de investigación / experimental**. **No** es un producto comercial. **No** es un servicio profesional. **No** es una herramienta certificada. **No** ofrece garantías de resultado, de disponibilidad, de confidencialidad ni de conformidad legal.

Nadie te debe un servicio. Nadie te debe un resultado «limpio». Nadie te debe que un detector deje de ver una marca. Si usas esto, lo haces **por tu cuenta y riesgo**.

---

## Datos: pueden guardarse

**No asumas** que «todo se procesa en local y se borra al instante». Eso **solo** es cierto, y de forma limitada, para el **MVP en el navegador** respecto a los **bytes del fichero** (no se suben al servidor de limpieza). Incluso ahí hay logs de red. A partir de **v1**, el contenido **sale de tu máquina**.

El autor y quien opere una instancia **pueden guardar** uploads, copias de ficheros procesados, informes de inspección, prompts de reescritura, logs, direcciones IP, User-Agent, marcas de tiempo, tamaños, tipos MIME y **cualquier otro metadato de uso**, con fines de **investigación**, depuración u operación. **No hay promesa de TTL, de anonimato, de no reutilizar ni de borrado a petición.**

Detalle por fase: [PLAN.md — Datos por fase](PLAN.md#datos-por-fase--data-by-phase). Si no quieres que un tercero vea o conserve tu contenido, **no uses v1 ni v1.5** y no subas nada.

---

## Descargo (sin suavizar)

EN LA MEDIDA MÁXIMA PERMITIDA POR LA LEY APLICABLE:

1. El software y cualquier instancia alojada se ofrecen **«TAL CUAL» (`AS IS`) y «SEGÚN DISPONIBILIDAD»**, **sin garantías** de ningún tipo, expresas o implícitas: comerciabilidad, idoneidad para un fin concreto, no infracción, exactitud, exhaustividad, seguridad, privacidad, disponibilidad o ausencia de defectos.

2. El **autor**, los **contribuidores**, el **proyecto FocAIRemover**, los operadores de cualquier despliegue y los autores del software **upstream** (watermarks-remover y demás) **NO SE HACEN RESPONSABLES DE NADA** derivado del uso, mal uso, imposibilidad de uso o resultados de esta herramienta, incluyendo de forma no limitativa:
   - el **resultado del limpieado** (completo, parcial, incorrecto, corrupto o inexistente);
   - que un **watermark, marca C2PA, metadato o señal estadística siga siendo detectable** por cualquier proveedor, plataforma, universidad, empleador, tribunal o detector (oficial o no);
   - el **uso que haga el usuario** (fraude académico, elusión de normas de transparencia, incumplimiento contractual, violación de derechos de terceros, o cualquier otro);
   - **daños**, **pérdidas** de datos, de reputación, económicas o de cualquier otra clase;
   - **sanciones académicas, disciplinarias, laborales, administrativas o legales**;
   - **fallos del servicio**, pérdida de ficheros, fugas, retención o publicación de datos, interrupciones, errores, omisiones o cambios de comportamiento.

3. **Tú** eres el único responsable de comprobar si puedes tratar el contenido, de las consecuencias de quitar (o no quitar) marcas, y de lo que hagas con la salida. **Nadie del proyecto asume esa responsabilidad por ti.**

4. Si alguna jurisdicción no permite la exclusión total de responsabilidad, esta se limita al **mínimo legal** y, en todo caso, a **cero** (0) en daños monetarios en la medida en que la ley lo permita.

Usar FocAIRemover implica que has leído esto y lo aceptas. Si no aceptas, no uses el software ni ninguna instancia alojada.

Texto de licencia MIT: [LICENSE](../LICENSE). La licencia **no** anula este descargo; lo complementa.

---

## English (short)

FocAIRemover is a **research / experimental** project, **not** a commercial product or a guaranteed service. **Data may be stored** (uploads, processed files, logs, usage metadata) for research or operations — do **not** assume local-only, instant deletion except for file bytes in the browser-only MVP (network logs still exist; from **v1** content leaves your machine). The author and the project **accept no responsibility whatsoever** for cleaning results, leftover-detectable watermarks, your use of the tool, damages, losses, academic or legal sanctions, or service failures. The software is provided **AS IS**, with **no warranties**. Full text above in Spanish.
