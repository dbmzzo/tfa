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

  function renderEmptyState() {
    if (!liveList) {
      return;
    }
    liveList.innerHTML =
      '<article class="card board-live-empty"><p>No member-created threads yet. Be the first to start one.</p></article>';
  }

  function renderThread(thread) {
    var article = document.createElement("article");
    article.className = "card board-index-row";
    article.innerHTML =
      '<div>' +
      '<p class="thread-tag">' + thread.category + '</p>' +
      '<h2><a class="thread-link" href="thread-live.html?slug=' + encodeURIComponent(thread.slug) + '">' + thread.title + '</a></h2>' +
      '<p class="thread-excerpt">' + thread.excerpt + '</p>' +
      '</div>' +
      '<p class="thread-meta">Started by <strong>' + thread.author + '</strong> | ' + thread.reply_count + ' replies</p>';
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
          renderEmptyState();
          return;
        }

        liveCount = payload.threads.length;
        updateOpenThreadCount();

        liveList.innerHTML = "";
        if (!payload.threads.length) {
          renderEmptyState();
          return;
        }

        payload.threads.forEach(function (thread) {
          liveList.appendChild(renderThread(thread));
        });
      })
      .catch(function () {
        renderEmptyState();
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
