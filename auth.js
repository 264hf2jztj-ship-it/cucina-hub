"use strict";

document.addEventListener(
  "DOMContentLoaded",
  initializeAuthentication
);

async function initializeAuthentication() {
  const authView = document.querySelector("#authView");
  const appHeader = document.querySelector("#appHeader");
  const appShell = document.querySelector("#appShell");
  const loginForm = document.querySelector("#loginForm");
  const emailInput = document.querySelector("#loginEmail");
  const passwordInput = document.querySelector("#loginPassword");
  const loginButton = document.querySelector("#loginButton");
  const logoutButton = document.querySelector("#logoutButton");
  const authMessage = document.querySelector("#authMessage");
  const viewRoot = document.querySelector("#viewRoot");
  const errorState = document.querySelector("#errorState");
  const recipeDialog = document.querySelector("#recipeDialog");
  const recipeDialogContent = document.querySelector("#recipeDialogContent");
  const client = window.cucinaHubSupabase;

  let validatedUserId = null;
  let authenticationBusy = false;

  function setMessage(message = "", type = "error") {
    authMessage.textContent = message;
    authMessage.dataset.type = type;
    authMessage.hidden = !message;
  }

  function clearPrivateInterface() {
    if (recipeDialog?.open) {
      recipeDialog.close();
    }

    if (recipeDialogContent) {
      recipeDialogContent.replaceChildren();
    }

    if (viewRoot) {
      viewRoot.replaceChildren();
      viewRoot.hidden = true;
    }

    if (errorState) {
      errorState.replaceChildren();
      errorState.hidden = true;
    }
  }

  function showLogin({ clearPrivateData = false } = {}) {
    if (clearPrivateData) {
      clearPrivateInterface();
    }

    validatedUserId = null;
    passwordInput.value = "";
    authView.hidden = false;
    appHeader.hidden = true;
    appShell.hidden = true;
    document.body.classList.add("auth-locked");

    requestAnimationFrame(() => {
      emailInput.focus();
    });
  }

  function showApplication() {
    authView.hidden = true;
    appHeader.hidden = false;
    appShell.hidden = false;
    document.body.classList.remove("auth-locked");
    setMessage("");

    if (viewRoot && !viewRoot.hasChildNodes() && typeof renderView === "function") {
      viewRoot.hidden = false;
      renderView("dashboard");
    }
  }

  async function verifyAdministrator(session) {
    const user = session?.user;

    if (!user) {
      return false;
    }

    if (validatedUserId === user.id) {
      return true;
    }

    const { data, error } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error) {
      throw error;
    }

    const isAdministrator = data?.role === "admin";

    if (isAdministrator) {
      validatedUserId = user.id;
    }

    return isAdministrator;
  }

  async function validateSession(session) {
    if (!session) {
      showLogin();
      return;
    }

    try {
      const isAdministrator = await verifyAdministrator(session);

      if (!isAdministrator) {
        await client.auth.signOut();
        setMessage("Questo account non è autorizzato.");
        showLogin({ clearPrivateData: true });
        return;
      }

      showApplication();
    } catch (error) {
      console.error("Errore verifica profilo:", error);
      await client.auth.signOut();
      setMessage("Non riesco a verificare il profilo amministratore.");
      showLogin({ clearPrivateData: true });
    }
  }

  if (!client) {
    setMessage("Il collegamento a Supabase non è disponibile.");
    showLogin();
    return;
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (authenticationBusy) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      setMessage("Inserisci email e password.");
      return;
    }

    authenticationBusy = true;
    loginButton.disabled = true;
    loginButton.textContent = "Accesso…";
    loginForm.setAttribute("aria-busy", "true");
    setMessage("");

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      await validateSession(data.session);
      passwordInput.value = "";
    } catch (error) {
      console.error("Errore durante l’accesso:", error);
      setMessage(
        error.message === "Invalid login credentials"
          ? "Email o password non corrette."
          : error.message
      );
    } finally {
      authenticationBusy = false;
      loginButton.disabled = false;
      loginButton.textContent = "Accedi";
      loginForm.removeAttribute("aria-busy");
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (authenticationBusy) {
      return;
    }

    authenticationBusy = true;
    logoutButton.disabled = true;
    logoutButton.textContent = "Uscita…";

    try {
      const { error } = await client.auth.signOut();

      if (error) {
        throw error;
      }

      showLogin({ clearPrivateData: true });
    } catch (error) {
      console.error("Errore durante il logout:", error);
      setMessage("Non riesco a completare il logout. Riprova.");
    } finally {
      authenticationBusy = false;
      logoutButton.disabled = false;
      logoutButton.textContent = "Esci";
    }
  });

  const { data, error } = await client.auth.getSession();

  if (error) {
    console.error("Errore lettura sessione:", error);
    setMessage("Non riesco a controllare la sessione.");
    showLogin();
    return;
  }

  await validateSession(data.session);

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLogin({ clearPrivateData: true });
      return;
    }

    if (event === "SIGNED_IN") {
      void validateSession(session);
      return;
    }

    if (event === "TOKEN_REFRESHED" && !session) {
      showLogin({ clearPrivateData: true });
    }
  });
}
