"use strict";

const client = window.cucinaHubSupabase;
const status = document.querySelector("#pageStatus");
const authGate = document.querySelector("#authGate");
const workspace = document.querySelector("#doughLabWorkspace");

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `dough-page-status${type ? ` ${type}` : ""}`;
}

async function initializeLab() {
  try {
    if (!client) throw new Error("Il collegamento a Cucina Hub non è disponibile.");

    const access = await window.CucinaHubAuthGuard.requireAdministrator(client);

    if (!access.authorized) {
      authGate.hidden = false;
      workspace.hidden = true;
      setStatus("Accedi dalla Dashboard per usare il Laboratorio.", "error");
      return;
    }

    authGate.hidden = true;
    workspace.hidden = false;
    setStatus("Laboratorio pronto.", "ok");
  } catch (error) {
    authGate.hidden = false;
    workspace.hidden = true;
    setStatus(error.message, "error");
  }
}

initializeLab();
