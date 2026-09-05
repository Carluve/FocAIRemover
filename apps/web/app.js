const MAX_BYTES = 32 * 1024 * 1024;
const ALLOWED = new Set([
  "txt", "md", "markdown", "html", "htm", "svg",
  "png", "jpg", "jpeg", "webp", "avif", "heic", "heif", "bmp", "gif", "tif", "tiff",
  "pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub",
  "mp4", "mov", "m4a", "m4v", "wav", "mp3", "flac",
]);
const TEXT_EXT = new Set(["txt", "md", "markdown", "html", "htm", "svg"]);

const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropTitle = document.getElementById("drop-title");
const dropHint = document.getElementById("drop-hint");
const form = document.getElementById("upload-form");
const submit = document.getElementById("submit");
const jobEl = document.getElementById("job");
const jobStatus = document.getElementById("job-status");
const jobJson = document.getElementById("job-json");
const jobActions = document.getElementById("job-actions");
const healthEl = document.getElementById("health-line");
const chip = document.getElementById("file-chip");
const chipName = document.getElementById("chip-name");
const chipSize = document.getElementById("chip-size");
const chipClear = document.getElementById("chip-clear");
const formError = document.getElementById("form-error");
const legalToggle = document.getElementById("legal-toggle");
const legalPanel = document.getElementById("legal-panel");
const steps = [...document.querySelectorAll("#steps [data-step]")];

let selected = null;
let pollTimer = null;
let health = { cleaner: "unconfigured", layerA: "up", canClean: { text: true, containers: false } };

legalToggle.addEventListener("click", () => {
  const open = legalToggle.getAttribute("aria-expanded") === "true";
  legalToggle.setAttribute("aria-expanded", String(!open));
  legalPanel.hidden = open;
});

refreshHealth();
setInterval(refreshHealth, 30_000);

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("drag");
});
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("drag");
  const file = e.dataTransfer?.files?.[0];
  if (file) setFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setFile(file);
});
chipClear.addEventListener("click", clearFile);

function extensionOf(name) {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function showFormError(msg) {
  formError.hidden = !msg;
  formError.textContent = msg || "";
}

function setFile(file) {
  const ext = extensionOf(file.name);
  if (!ext || !ALLOWED.has(ext)) {
    showFormError(`Extensión .${ext || "?"} no permitida.`);
    return;
  }
  if (file.size <= 0) {
    showFormError("El fichero está vacío.");
    return;
  }
  if (file.size > MAX_BYTES) {
    showFormError(`Supera el límite de 32 MiB (${formatSize(file.size)}).`);
    return;
  }
  if (!TEXT_EXT.has(ext) && health.canClean?.containers === false) {
    showFormError(
      "Este formato necesita el cleaner remoto (CLEANER_URL o Container). Capa A sí limpia .txt / .md / .html / .svg.",
    );
  } else {
    showFormError("");
  }

  selected = file;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  chip.hidden = false;
  chipName.textContent = file.name;
  chipSize.textContent = formatSize(file.size);
  drop.classList.add("has-file");
  dropTitle.textContent = "Fichero listo";
  dropHint.textContent = "Puedes soltar otro para reemplazarlo";
  submit.disabled = false;
}

function clearFile() {
  selected = null;
  fileInput.value = "";
  chip.hidden = true;
  drop.classList.remove("has-file");
  dropTitle.textContent = "Arrastra un fichero aquí";
  dropHint.textContent = "o haz clic para elegir · máx. 32 MiB";
  submit.disabled = true;
  showFormError("");
}

async function refreshHealth() {
  if (!healthEl) return;
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    health = data;
    const textOk = data.layerA === "up" || data.canClean?.text;
    const remote = data.cleaner || data.remoteCleaner;
    if (remote === "up") {
      healthEl.textContent = "Capa A y cleaner remoto listos · R2 focairemover-files";
      healthEl.className = "health ok";
    } else if (textOk) {
      healthEl.textContent =
        "Capa A lista · cleaner de PDF/imagen: no configurado (un paso: CLEANER_URL o Container)";
      healthEl.className = "health warn";
    } else {
      healthEl.textContent = "API alcanzada, cleaner no disponible";
      healthEl.className = "health warn";
    }
  } catch {
    healthEl.textContent = "API no disponible";
    healthEl.className = "health err";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selected) return;
  submit.disabled = true;
  jobEl.hidden = false;
  jobActions.replaceChildren();
  setStep("uploaded");
  setStatus("Subiendo a R2…");
  try {
    const body = new FormData();
    body.set("file", selected, selected.name);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body,
    });
    const data = await res.json();
    renderJob(data);
    if (!res.ok) {
      setStep("ready", "error");
      setStatus(data.message || data.error || "Fallo al subir", true);
      submit.disabled = false;
      return;
    }
    setStep("cleaning");
    poll(data.id);
  } catch (err) {
    setStep("ready", "error");
    setStatus(String(err), true);
    submit.disabled = false;
  }
});

async function poll(id) {
  clearInterval(pollTimer);
  let ticks = 0;
  const tick = async () => {
    ticks += 1;
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      renderJob(data);
      if (data.status === "done") {
        clearInterval(pollTimer);
        setStep("ready", "done");
        const removed = data.reportSummary?.removedCount;
        const extra =
          typeof removed === "number"
            ? ` Capa A quitó ${removed} marca${removed === 1 ? "" : "s"} invisible${removed === 1 ? "" : "s"}.`
            : "";
        setStatus(`Listo.${extra} Original y salida quedan en R2. No es un certificado Anthropic.`, false, true);
        jobActions.replaceChildren();
        const a = document.createElement("a");
        a.href = `/api/jobs/${id}/download`;
        a.textContent = "Descargar limpio";
        jobActions.appendChild(a);
        const report = document.createElement("a");
        report.href = `/api/jobs/${id}/report`;
        report.className = "btn-secondary";
        report.textContent = "Informe JSON";
        jobActions.appendChild(report);
        submit.disabled = false;
      } else if (data.status === "error") {
        clearInterval(pollTimer);
        setStep("ready", "error");
        setStatus(friendlyError(data.error), true);
        renderRetry(id);
        submit.disabled = false;
      } else {
        setStep("cleaning");
        setStatus(
          data.status === "processing"
            ? "Limpiando en el Worker…"
            : "En cola…",
        );
      }
    } catch (err) {
      setStatus(`No se pudo leer el job: ${err}`, true);
    }
    if (ticks >= 40) {
      clearInterval(pollTimer);
      setStatus("Tiempo de espera agotado. Puedes reintentar.", true);
      renderRetry(id);
      submit.disabled = false;
    }
  };
  await tick();
  pollTimer = setInterval(tick, 1500);
}

function friendlyError(error) {
  const raw = error || "error";
  if (/cleaner_unconfigured/i.test(raw)) {
    return "Este formato necesita CLEANER_URL o un Container. Prueba un .txt / .md, o activa el cleaner remoto.";
  }
  if (/cleaner_unreachable/i.test(raw)) {
    return "El cleaner remoto no responde. Reintenta o revisa CLEANER_URL.";
  }
  if (/invalid_utf8/i.test(raw)) {
    return "El fichero no es UTF-8 válido para Capa A.";
  }
  return raw;
}

function renderRetry(id) {
  jobActions.replaceChildren();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "retry";
  btn.className = "btn-secondary";
  btn.textContent = "Reintentar limpieza";
  btn.addEventListener("click", () => retry(id));
  jobActions.appendChild(btn);
}

async function retry(id) {
  const btn = document.getElementById("retry");
  if (btn) btn.disabled = true;
  setStep("cleaning");
  setStatus("Reintentando…");
  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: id }),
    });
    const data = await res.json();
    renderJob(data);
    if (!res.ok) {
      setStep("ready", "error");
      setStatus(data.message || data.error || "retry failed", true);
      renderRetry(id);
      return;
    }
    poll(id);
  } catch (err) {
    setStep("ready", "error");
    setStatus(String(err), true);
    renderRetry(id);
  }
}

function renderJob(data) {
  jobJson.textContent = JSON.stringify(data, null, 2);
}

function setStatus(text, isError = false, isOk = false) {
  jobStatus.textContent = text;
  jobStatus.className = `job-status${isError ? " error" : ""}${isOk ? " ok" : ""}`;
}

function setStep(name, kind) {
  const order = ["uploaded", "cleaning", "ready"];
  const idx = order.indexOf(name);
  for (const li of steps) {
    const step = li.getAttribute("data-step");
    const i = order.indexOf(step);
    li.removeAttribute("aria-current");
    li.classList.remove("is-done", "is-error");
    if (kind === "error" && step === "ready") {
      li.classList.add("is-error");
      li.setAttribute("aria-current", "step");
    } else if (i < idx || (kind === "done" && i <= idx)) {
      li.classList.add("is-done");
    } else if (i === idx) {
      li.setAttribute("aria-current", "step");
    }
  }
}
