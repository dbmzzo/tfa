document.addEventListener("DOMContentLoaded", function () {
  if (!window.location.pathname.endsWith("thread-live.html")) {
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var slug = params.get("slug");
  var titleNode = document.querySelector(".live-thread-title");
  var metaNode = document.querySelector(".live-thread-meta");
  var categoryNode = document.querySelector(".live-thread-category");
  var listNode = document.querySelector(".live-thread-post-list");
  var authState = { authenticated: false, user: null };
  var replyForm;
  var replyTextarea;
  var replyStatus;

  function createModal() {
    var modal = document.createElement("div");
    modal.className = "board-modal";
    modal.hidden = true;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="board-modal-backdrop" data-close="true"></div>' +
      '<div class="board-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="board-modal-title">' +
      '<button class="board-modal-close" type="button" aria-label="Close" data-close="true">x</button>' +
      '<h2 id="board-modal-title">In the spirit of fairness you must log in to participate in the conversation.</h2>' +
      '<p class="board-modal-copy">Join the conversation</p>' +
      '<a class="board-modal-action" href="message-board-access.html">Create An Account</a>' +
      "</div>";
    document.body.appendChild(modal);

    var dialog = modal.querySelector(".board-modal-dialog");
    function toggle(show) {
      modal.hidden = !show;
      modal.style.display = show ? "grid" : "none";
      document.body.classList.toggle("board-modal-open", show);
    }
    modal.addEventListener("click", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.target.dataset.close === "true" || event.target === modal) {
        toggle(false);
      }
    });
    if (dialog) {
      dialog.addEventListener("click", function (event) { event.stopPropagation(); });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) {
        toggle(false);
      }
    });
    return { show: function () { toggle(true); } };
  }

  var modal = createModal();

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBody(body) {
    return escapeHtml(body).replace(/\n/g, "<br>");
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().then(function (data) {
        return { response: response, data: data };
      });
    });
  }

  function createVoteBar(postKey, baseUp, baseDown) {
    var voteBar = document.createElement("div");
    voteBar.className = "post-votes";
    voteBar.dataset.postKey = postKey;
    voteBar.dataset.baseUp = String(baseUp || 0);
    voteBar.dataset.baseDown = String(baseDown || 0);

    var upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "post-vote-button";
    upButton.innerHTML = '<span class="post-vote-label">Up Hoot</span><span class="post-vote-count">' + (baseUp || 0) + "</span>";

    var downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "post-vote-button";
    downButton.innerHTML = '<span class="post-vote-label">Down Hoot</span><span class="post-vote-count">' + (baseDown || 0) + "</span>";

    var replyButton = document.createElement("button");
    replyButton.type = "button";
    replyButton.className = "post-vote-button post-reply-button";
    replyButton.innerHTML = '<span class="post-vote-label">Reply</span>';

    function castVote(button, value) {
      if (!authState.authenticated) {
        modal.show();
        return;
      }
      var currentVote = Number(voteBar.dataset.userVote || 0);
      var nextVote = currentVote === value ? 0 : value;
      fetchJson("/api/votes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_key: postKey, value: nextVote })
      }).then(function (result) {
        if (!result.response.ok) {
          modal.show();
          return;
        }
        applyVoteState(voteBar, result.data.vote);
      });
    }

    upButton.addEventListener("click", function () { castVote(upButton, 1); });
    downButton.addEventListener("click", function () { castVote(downButton, -1); });
    replyButton.addEventListener("click", function () {
      if (!authState.authenticated) {
        modal.show();
        return;
      }
      if (replyTextarea) {
        replyTextarea.focus();
      }
    });

    voteBar.appendChild(upButton);
    voteBar.appendChild(downButton);
    voteBar.appendChild(replyButton);
    return voteBar;
  }

  function applyVoteState(voteBar, state) {
    var upCount = voteBar.querySelector(".post-vote-button:nth-child(1) .post-vote-count");
    var downCount = voteBar.querySelector(".post-vote-button:nth-child(2) .post-vote-count");
    var upButton = voteBar.children[0];
    var downButton = voteBar.children[1];
    var baseUp = Number(voteBar.dataset.baseUp || 0);
    var baseDown = Number(voteBar.dataset.baseDown || 0);

    if (upCount) {
      upCount.textContent = String(baseUp + (state.up || 0));
    }
    if (downCount) {
      downCount.textContent = String(baseDown + (state.down || 0));
    }

    voteBar.dataset.userVote = String(state.user_vote || 0);
    upButton.classList.toggle("is-selected", state.user_vote === 1);
    downButton.classList.toggle("is-selected", state.user_vote === -1);
  }

  function renderPost(author, subtitle, body, postKey, baseUp, baseDown) {
    var article = document.createElement("article");
    article.className = "board-post";

    var authorNode = document.createElement("div");
    authorNode.className = "post-author";

    var avatar = document.createElement("span");
    avatar.className = "post-avatar avatar-sidepot";
    avatar.setAttribute("aria-hidden", "true");

    var name = document.createElement("strong");
    name.textContent = author || "";

    var subtitleNode = document.createElement("span");
    subtitleNode.textContent = subtitle || "";

    authorNode.appendChild(avatar);
    authorNode.appendChild(name);
    authorNode.appendChild(subtitleNode);

    var bodyNode = document.createElement("div");
    bodyNode.className = "post-body";

    var bodyParagraph = document.createElement("p");
    bodyParagraph.innerHTML = formatBody(body);
    bodyNode.appendChild(bodyParagraph);
    bodyNode.appendChild(createVoteBar(postKey, baseUp, baseDown));

    article.appendChild(authorNode);
    article.appendChild(bodyNode);
    return article;
  }

  function refreshVoteStates() {
    var bars = Array.prototype.slice.call(document.querySelectorAll(".post-votes[data-post-key]"));
    if (!bars.length) {
      return;
    }
    var keys = bars.map(function (bar) { return bar.dataset.postKey; });
    fetchJson("/api/votes?keys=" + encodeURIComponent(keys.join(",")), {
      credentials: "same-origin"
    }).then(function (result) {
      if (!result.response.ok) {
        return;
      }
      bars.forEach(function (bar) {
        var state = result.data.votes[bar.dataset.postKey] || { up: 0, down: 0, user_vote: 0 };
        applyVoteState(bar, state);
      });
    });
  }

  function renderReplyComposer(threadKey) {
    var composer = document.createElement("article");
    composer.className = "board-post board-post-composer";
    composer.innerHTML =
      '<div class="post-author"><span class="post-avatar avatar-sidepot" aria-hidden="true"></span><strong>Join The Thread</strong><span>Signed-in members can reply here</span></div>' +
      '<div class="post-body">' +
      '<p class="board-community-login-note">Sign in on the message board to join this discussion.</p>' +
      '<form class="board-reply-form" hidden>' +
      '<label for="live-reply-body">Add Reply</label>' +
      '<textarea id="live-reply-body" name="body" rows="5" placeholder="Share your take on the thread..."></textarea>' +
      '<div class="board-login-actions"><button class="board-login-button" type="submit">Post Reply</button></div>' +
      '<p class="board-auth-status"></p>' +
      '</form>' +
      '</div>';
    listNode.appendChild(composer);

    var loginNote = composer.querySelector(".board-community-login-note");
    replyForm = composer.querySelector(".board-reply-form");
    replyTextarea = composer.querySelector("textarea");
    replyStatus = composer.querySelector(".board-auth-status");

    function syncReplyAccess() {
      if (!replyForm || !loginNote) {
        return;
      }
      replyForm.hidden = !authState.authenticated;
      loginNote.hidden = !!authState.authenticated;
    }

    function appendReply(reply) {
      composer.before(renderPost(reply.author, "Community member", reply.body, reply.post_key, 0, 0));
      refreshVoteStates();
    }

    fetchJson("/api/replies?thread_key=" + encodeURIComponent(threadKey), {
      credentials: "same-origin"
    }).then(function (result) {
      if (!result.response.ok) {
        return;
      }
      result.data.replies.forEach(appendReply);
    });

    replyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      replyStatus.textContent = "Posting reply...";
      fetchJson("/api/replies", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_key: threadKey, body: replyTextarea.value })
      }).then(function (result) {
        if (!result.response.ok) {
          replyStatus.textContent = result.data.error || "Unable to post reply.";
          replyStatus.classList.add("is-error");
          return;
        }
        replyStatus.textContent = "Reply posted.";
        replyStatus.classList.remove("is-error");
        replyStatus.classList.add("is-success");
        replyTextarea.value = "";
        appendReply(result.data.reply);
      });
    });

    document.addEventListener("tfa-auth-ready", function (event) {
      authState = { authenticated: !!event.detail.user, user: event.detail.user };
      syncReplyAccess();
      refreshVoteStates();
    });

    syncReplyAccess();
  }

  if (!slug) {
    titleNode.textContent = "Thread not found";
    metaNode.textContent = "Missing thread slug.";
    return;
  }

  document.addEventListener("tfa-auth-ready", function (event) {
    authState = { authenticated: !!event.detail.user, user: event.detail.user };
    refreshVoteStates();
  });

  fetchJson("/api/thread?slug=" + encodeURIComponent(slug), { credentials: "same-origin" })
    .then(function (result) {
      if (!result.response.ok || !result.data.thread) {
        titleNode.textContent = "Thread not found";
        metaNode.textContent = "This community thread could not be loaded.";
        return;
      }

      var thread = result.data.thread;
      document.title = "TFA Thread: " + thread.title;
      titleNode.textContent = thread.title;
      metaNode.innerHTML = 'Started by <strong>' + thread.author + '</strong> | ' + thread.reply_count + ' replies';
      categoryNode.textContent = thread.category;
      listNode.innerHTML = "";
      listNode.appendChild(renderPost(thread.author, "Thread author", thread.body, thread.root_post_key, 0, 0));
      renderReplyComposer(thread.thread_key);
      refreshVoteStates();
    });
});
