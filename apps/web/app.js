const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropLabel = document.getElementById("drop-label");
const form = document.getElementById("upload-form");
const submit = document.getElementById("submit");
const jobEl = document.getElementById("job");
const jobStatus = document.getElementById("job-status");
const jobJson = document.getElementById("job-json");
const jobActions = document.getElementById("job-actions");

let selected = null;
let pollTimer = null;

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
      submit.disabled = false;
    } else {
      setStatus(`Estado: ${data.status}. El cleaner corre en el servidor (no en el navegador).`);
    }
  };
  await tick();
  pollTimer = setInterval(tick, 1500);
}

function renderJob(data) {
  jobJson.textContent = JSON.stringify(data, null, 2);
}

function setStatus(text, isError = false) {
  jobStatus.textContent = text;
  jobStatus.className = isError ? "error" : "";
}
