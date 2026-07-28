"use strict";

document.addEventListener(
  "DOMContentLoaded",
  initializeAuthentication
);

async function initializeAuthentication() {
  const authView =
    document.querySelector("#authView");

  const loginForm =
    document.querySelector("#loginForm");

  const emailInput =
    document.querySelector("#loginEmail");

  const passwordInput =
    document.querySelector("#loginPassword");

  const loginButton =
    document.querySelector("#loginButton");

  const authMessage =
    document.querySelector("#authMessage");

  const client =
    window.cucinaHubSupabase;

  function setMessage(message = "", type = "error") {
    authMessage.textContent = message;
    authMessage.dataset.type = type;
    authMessage.hidden = !message;
  }

  function showLogin() {
    authView.hidden = false;
    document.body.classList.add("auth-locked");

    requestAnimationFrame(() => {
      emailInput.focus();
    });
  }

  function hideLogin() {
    authView.hidden = true;
    document.body.classList.remove("auth-locked");
    setMessage("");
  }

  async function verifyAdministrator(session) {
    const user = session?.user;

    if (!user) {
      return false;
    }

    const { data, error } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error) {
      throw error;
    }

    return data?.role === "admin";
  }

  async function validateSession(session) {
    if (!session) {
      showLogin();
      return;
    }

    try {
      const isAdministrator =
        await verifyAdministrator(session);

      if (!isAdministrator) {
        await client.auth.signOut();

        setMessage(
          "Questo account non è autorizzato."
        );

        showLogin();
        return;
      }

      hideLogin();
    } catch (error) {
      console.error(
        "Errore verifica profilo:",
        error
      );

      await client.auth.signOut();

      setMessage(
        "Non riesco a verificare il profilo amministratore."
      );

      showLogin();
    }
  }

  if (!client) {
    setMessage(
      "Il collegamento a Supabase non è disponibile."
    );

    showLogin();
    return;
  }

  loginForm.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const email =
        emailInput.value.trim();

      const password =
        passwordInput.value;

      if (!email || !password) {
        setMessage(
          "Inserisci email e password."
        );

        return;
      }

      loginButton.disabled = true;
      loginButton.textContent = "Accesso…";
      loginForm.setAttribute("aria-busy", "true");
      setMessage("");

      try {
        const { data, error } =
          await client.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          throw error;
        }

        const isAdministrator =
          await verifyAdministrator(data.session);

        if (!isAdministrator) {
          await client.auth.signOut();

          throw new Error(
            "Account non autorizzato."
          );
        }

        passwordInput.value = "";
        hideLogin();
      } catch (error) {
        console.error(
          "Errore durante l’accesso:",
          error
        );

        setMessage(
          error.message ===
            "Invalid login credentials"
            ? "Email o password non corrette."
            : error.message
        );
      } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Accedi";
        loginForm.removeAttribute("aria-busy");
      }
    }
  );

  const { data, error } =
    await client.auth.getSession();

  if (error) {
    console.error(
      "Errore lettura sessione:",
      error
    );

    setMessage(
      "Non riesco a controllare la sessione."
    );

    showLogin();
    return;
  }

  await validateSession(data.session);

  client.auth.onAuthStateChange(
    event => {
      if (event === "SIGNED_OUT") {
        showLogin();
      }
    }
  );
}
