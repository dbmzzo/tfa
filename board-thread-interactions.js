document.addEventListener("DOMContentLoaded", function () {
  var posts = document.querySelectorAll(".board-post");
  if (!posts.length) {
    return;
  }

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

  function toggleModal(show) {
    modal.hidden = !show;
    modal.style.display = show ? "grid" : "none";
    modal.setAttribute("aria-hidden", show ? "false" : "true");
    document.body.classList.toggle("board-modal-open", show);
  }

  var closeButton = modal.querySelector(".board-modal-close");
  if (closeButton) {
    closeButton.addEventListener("click", function () {
      toggleModal(false);
    });
  }

  if (dialog) {
    dialog.addEventListener("click", function (event) {
      event.stopPropagation();
    });
  }

  modal.addEventListener("click", function (event) {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.dataset.close === "true") {
      toggleModal(false);
      return;
    }

    toggleModal(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) {
      toggleModal(false);
    }
  });

  posts.forEach(function (post, index) {
    var postBody = post.querySelector(".post-body");
    if (!postBody) {
      return;
    }

    var voteBar = document.createElement("div");
    voteBar.className = "post-votes";

    var upCount = ((index * 17 + 23) % 87) + 3;
    var downCount = ((index * 7 + 5) % 15);

    var upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "post-vote-button";
    upButton.innerHTML = '<span class="post-vote-label">Up Hoot</span><span class="post-vote-count">' + upCount + "</span>";

    var downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "post-vote-button";
    downButton.innerHTML = '<span class="post-vote-label">Down Hoot</span><span class="post-vote-count">' + downCount + "</span>";

    upButton.addEventListener("click", function () {
      toggleModal(true);
    });

    downButton.addEventListener("click", function () {
      toggleModal(true);
    });

    voteBar.appendChild(upButton);
    voteBar.appendChild(downButton);
    postBody.appendChild(voteBar);
  });
});
