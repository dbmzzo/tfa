document.addEventListener("DOMContentLoaded", function () {
  var loginForm = document.querySelector(".board-login-form");
  var registerForm = document.querySelector(".board-register-form");
  var loginPanel = document.querySelector(".board-login-panel");
  var registerPanel = document.querySelector(".board-register-panel");
  var startThreadButton = document.querySelector(".board-start-thread-button");

  function ensureStatusNode(container, className) {
    if (!container) {
      return null;
    }

    var existing = container.querySelector("." + className);
    if (existing) {
      return existing;
    }

    var node = document.createElement("p");
    node.className = className;
    container.appendChild(node);
    return node;
  }

  function setStatus(node, message, kind) {
    if (!node) {
      return;
    }
    node.textContent = message || "";
    node.classList.remove("is-error", "is-success");
    if (kind) {
      node.classList.add(kind);
    }
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: "Unexpected server response." };
      }).then(function (data) {
        return { response: response, data: data };
      });
    });
  }

  function showLoggedInState(user) {
    if (loginForm) {
      loginForm.hidden = true;
    }

    if (loginPanel && !loginPanel.querySelector(".board-user-panel")) {
      var panel = document.createElement("div");
      panel.className = "board-user-panel";
      panel.innerHTML =
        '<p class="board-kicker">Signed In</p>' +
        "<h2>Welcome back, " + user.username + "</h2>" +
        '<p class="thread-excerpt">Your account is active across the message board. Voting and reply actions now recognize your login.</p>' +
        '<div class="board-login-actions">' +
        '<button class="board-login-button board-logout-button" type="button">Log Out</button>' +
        "</div>";
      loginPanel.appendChild(panel);

      var logoutButton = panel.querySelector(".board-logout-button");
      logoutButton.addEventListener("click", function () {
        postJson("/api/logout").then(function () {
          window.location.reload();
        });
      });
    }

    if (startThreadButton) {
      startThreadButton.setAttribute("href", "#board-thread-composer");
      startThreadButton.dataset.authenticated = "true";
    }

    document.dispatchEvent(new CustomEvent("tfa-auth-ready", { detail: { user: user } }));
  }

  function showLoggedOutState() {
    if (loginForm) {
      loginForm.hidden = false;
    }
    if (startThreadButton) {
      startThreadButton.dataset.authenticated = "false";
    }
    document.dispatchEvent(new CustomEvent("tfa-auth-ready", { detail: { user: null } }));
  }

  function hydrateSession() {
    return fetch("/api/session", { credentials: "same-origin" })
      .then(function (response) { return response.json(); })
      .then(function (session) {
        window.TFABoardAuth = session;
        if (session.authenticated && session.user) {
          showLoggedInState(session.user);
        } else {
          showLoggedOutState();
        }

        if (registerPanel && session.authenticated && session.user) {
          registerPanel.innerHTML =
            '<p class="board-kicker">Account Ready</p>' +
            "<h2>You are already signed in as " + session.user.username + ".</h2>" +
            '<p class="thread-excerpt">Head back to the board to use your account.</p>' +
            '<div class="board-login-actions"><a class="board-login-button" href="message-board.html">Return to Message Board</a></div>';
        }
      })
      .catch(function () {
        window.TFABoardAuth = { authenticated: false, user: null };
      });
  }

  if (loginForm) {
    var loginStatus = ensureStatusNode(loginForm, "board-auth-status");
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var username = loginForm.querySelector('[name="username"]').value;
      var password = loginForm.querySelector('[name="password"]').value;
      setStatus(loginStatus, "Signing you in...", null);
      postJson("/api/login", { username: username, password: password }).then(function (result) {
        if (!result.response.ok) {
          setStatus(loginStatus, result.data.error || "Unable to sign in.", "is-error");
          return;
        }
        setStatus(loginStatus, "Signed in successfully. Reloading...", "is-success");
        window.location.reload();
      }).catch(function () {
        setStatus(loginStatus, "Unable to sign in right now.", "is-error");
      });
    });
  }

  if (registerForm) {
    var registerStatus = ensureStatusNode(registerForm, "board-auth-status");
    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var username = registerForm.querySelector('[name="username"]').value;
      var password = registerForm.querySelector('[name="password"]').value;
      var confirmPassword = registerForm.querySelector('[name="confirm_password"]').value;
      setStatus(registerStatus, "Creating your account...", null);
      postJson("/api/register", {
        username: username,
        password: password,
        confirm_password: confirmPassword
      }).then(function (result) {
        if (!result.response.ok) {
          setStatus(registerStatus, result.data.error || "Unable to create account.", "is-error");
          return;
        }
        setStatus(registerStatus, "Account created. Redirecting to the board...", "is-success");
        window.setTimeout(function () {
          window.location.href = "message-board.html";
        }, 800);
      }).catch(function () {
        setStatus(registerStatus, "Unable to create account right now.", "is-error");
      });
    });
  }

  hydrateSession();
});
