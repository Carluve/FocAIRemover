const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropLabel = document.getElementById("drop-label");
const form = document.getElementById("upload-form");
const submit = document.getElementById("submit");
const jobEl = document.getElementById("job");
const jobStatus = document.getElementById("job-status");
const jobJson = document.getElementById("job-json");
const jobActions = document.getElementById("job-actions");
const healthEl = document.getElementById("health-line");

let selected = null;
let pollTimer = null;

refreshHealth();

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

function setFile(file) {
  selected = file;
  dropLabel.textContent = `${file.name} (${file.size} bytes)`;
  submit.disabled = false;
}

async function refreshHealth() {
  if (!healthEl) return;
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const cleaner = data.cleaner === "up" ? "cleaner: up" : "cleaner: down";
    healthEl.textContent = `${cleaner} · R2 ${data.r2 || "focairemover-files"} · enterprise`;
    healthEl.className = data.cleaner === "up" ? "health ok" : "health warn";
  } catch {
    healthEl.textContent = "API no disponible / API unavailable";
    healthEl.className = "health warn";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selected) return;
  submit.disabled = true;
  jobEl.hidden = false;
  jobActions.textContent = "";
  setStatus("Subiendo a R2… / Uploading to R2…");
  try {
    const body = new FormData();
    body.set("file", selected, selected.name);
    const res = await fetch("/api/upload", { method: "POST", body });
    const data = await res.json();
    renderJob(data);
    if (!res.ok) {
      setStatus(data.message || data.error || "upload failed", true);
      submit.disabled = false;
      return;
    }
    poll(data.id);
  } catch (err) {
    setStatus(String(err), true);
    submit.disabled = false;
  }
});

async function poll(id) {
  clearInterval(pollTimer);
  const tick = async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      renderJob(data);
      if (data.status === "done") {
        clearInterval(pollTimer);
        setStatus("Listo. Descarga el fichero limpio. El original y la salida quedan en R2.");
        jobActions.innerHTML = `<a href="/api/jobs/${id}/download">Descargar / Download</a>`;
        submit.disabled = false;
      } else if (data.status === "error") {
        clearInterval(pollTimer);
        setStatus(data.error || "error", true);
        renderRetry(id);
        submit.disabled = false;
      } else {
        setStatus(`Estado: ${data.status}. El cleaner corre en el servidor (no en el navegador).`);
      }
    } catch (err) {
      setStatus(`No se pudo leer el job: ${err}`, true);
    }
  };
  await tick();
  pollTimer = setInterval(tick, 1500);
}

function renderRetry(id) {
  jobActions.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "retry";
  btn.textContent = "Reintentar limpieza / Retry clean";
  btn.addEventListener("click", () => retry(id));
  jobActions.appendChild(btn);
}

async function retry(id) {
  const btn = document.getElementById("retry");
  if (btn) btn.disabled = true;
  setStatus("Reintentando… / Retrying…");
  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: id }),
    });
    const data = await res.json();
    renderJob(data);
    if (!res.ok) {
      setStatus(data.message || data.error || "retry failed", true);
      renderRetry(id);
      return;
    }
    poll(id);
  } catch (err) {
    setStatus(String(err), true);
    renderRetry(id);
  }
}

function renderJob(data) {
  jobJson.textContent = JSON.stringify(data, null, 2);
}

function setStatus(text, isError = false) {
  jobStatus.textContent = text;
  jobStatus.className = isError ? "error" : "";
}
