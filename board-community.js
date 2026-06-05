document.addEventListener("DOMContentLoaded", function () {
  if (!window.location.pathname.endsWith("message-board.html")) {
    return;
  }

  var liveList = document.querySelector(".board-live-list");
  var composer = document.querySelector(".board-thread-composer");
  var composerStatus = document.querySelector(".board-thread-composer-status");
  var composerNotice = document.querySelector(".board-thread-composer-notice");
  var startThreadButton = document.querySelector(".board-start-thread-button");
  var statsOpenThreads = document.querySelector(".board-stats-open-threads");
  var liveCount = 0;
  var currentUser = null;

  function setComposerStatus(message, kind) {
    if (!composerStatus) {
      return;
    }
    composerStatus.textContent = message || "";
    composerStatus.classList.remove("is-error", "is-success");
    if (kind) {
      composerStatus.classList.add(kind);
    }
  }

  function appendText(parent, tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text || "";
    parent.appendChild(element);
    return element;
  }

  function renderThread(thread) {
    var article = document.createElement("article");
    article.className = "card board-index-row";

    var summary = document.createElement("div");
    appendText(summary, "p", "thread-tag", thread.category);

    var heading = document.createElement("h2");
    var link = document.createElement("a");
    link.className = "thread-link";
    link.href = "thread-live.html?slug=" + encodeURIComponent(thread.slug);
    link.textContent = thread.title || "";
    heading.appendChild(link);
    summary.appendChild(heading);

    appendText(summary, "p", "thread-excerpt", thread.excerpt);

    var meta = document.createElement("p");
    meta.className = "thread-meta";
    meta.appendChild(document.createTextNode("Started by "));
    appendText(meta, "strong", null, thread.author);
    meta.appendChild(document.createTextNode(" | " + (thread.reply_count || 0) + " replies"));

    article.appendChild(summary);
    article.appendChild(meta);
    return article;
  }

  function updateOpenThreadCount() {
    if (!statsOpenThreads) {
      return;
    }
    var base = Number(statsOpenThreads.dataset.baseOpenThreads || statsOpenThreads.textContent);
    statsOpenThreads.textContent = String(base + liveCount);
  }

  function loadThreads() {
    if (!liveList) {
      return;
    }

    fetch("/api/threads", { credentials: "same-origin" })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (!payload.ok) {
          liveList.innerHTML = "";
          return;
        }

        liveCount = payload.threads.length;
        updateOpenThreadCount();

        liveList.innerHTML = "";
        if (!payload.threads.length) {
          return;
        }

        payload.threads.forEach(function (thread) {
          liveList.appendChild(renderThread(thread));
        });
      })
      .catch(function () {
        liveList.innerHTML = "";
      });
  }

  function syncComposerState() {
    if (!composer || !composerNotice) {
      return;
    }
    composer.hidden = !currentUser;
    composerNotice.hidden = !!currentUser;
  }

  if (startThreadButton) {
    startThreadButton.addEventListener("click", function (event) {
      if (startThreadButton.dataset.authenticated !== "true") {
        return;
      }
      event.preventDefault();
      if (!composer) {
        return;
      }
      composer.hidden = false;
      composer.scrollIntoView({ behavior: "smooth", block: "start" });
      var firstInput = composer.querySelector('[name="title"]');
      if (firstInput) {
        firstInput.focus();
      }
    });
  }

  document.addEventListener("tfa-auth-ready", function (event) {
    currentUser = event.detail.user;
    syncComposerState();
  });

  if (composer) {
    composer.addEventListener("submit", function (event) {
      event.preventDefault();
      var title = composer.querySelector('[name="title"]').value;
      var category = composer.querySelector('[name="category"]').value;
      var body = composer.querySelector('[name="body"]').value;
      setComposerStatus("Posting your thread...", null);
      fetch("/api/threads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title, category: category, body: body })
      }).then(function (response) {
        return response.json().then(function (data) {
          return { response: response, data: data };
        });
      }).then(function (result) {
        if (!result.response.ok) {
          setComposerStatus(result.data.error || "Unable to post thread.", "is-error");
          return;
        }
        setComposerStatus("Thread posted. Opening it now...", "is-success");
        window.location.href = "thread-live.html?slug=" + encodeURIComponent(result.data.thread.slug);
      }).catch(function () {
        setComposerStatus("Unable to post thread right now.", "is-error");
      });
    });
  }

  syncComposerState();
  loadThreads();
});
