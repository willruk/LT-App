console.log("Life Tracks loaded");

var birthdayInput = document.getElementById("birthday");
var goButton = document.getElementById("go");
var rangeNote = document.getElementById("rangeNote");
var birthResult = document.getElementById("birthResult");
var yearlyResult = document.getElementById("yearlyResult");
var loadingOverlay = document.getElementById("loadingOverlay");
var yearlyCard = document.getElementById("yearlyCard");

function setLoading(isLoading) {
  if (!loadingOverlay) return;

  if (isLoading) {
    loadingOverlay.style.display = "flex";
    requestAnimationFrame(function () {
      loadingOverlay.classList.add("active");
      loadingOverlay.setAttribute("aria-hidden", "false");
    });
  } else {
    loadingOverlay.classList.remove("active");
    loadingOverlay.setAttribute("aria-hidden", "true");

    setTimeout(function () {
      if (!loadingOverlay.classList.contains("active")) {
        loadingOverlay.style.display = "none";
      }
    }, 450);
  }
}

function showResults() {
  var birthCard = document.getElementById("birthCard");
  var wrap = document.querySelector(".wrap");

  if (birthCard) birthCard.style.display = "block";
  if (yearlyCard) yearlyCard.style.display = "block";
  if (wrap) wrap.classList.add("results-active");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMusicButtons(spotifyUrl, appleUrl) {
  return (
    "<div class='music-buttons'>" +
      "<a href='" + escapeHtml(spotifyUrl) + "' target='_blank'>" +
        "<img src='/spotify_button_small.png' alt='Spotify'>" +
      "</a>" +
      "<a href='" + escapeHtml(appleUrl) + "' target='_blank'>" +
        "<img src='/apple_button_small.png' alt='Apple Music'>" +
      "</a>" +
    "</div>"
  );
}

/* =========================
   🎵 BIRTH SONG
========================= */
function renderBirthSong(data) {
  if (!data || !data.birthSong) {
    birthResult.innerHTML = "No data found.";
    return;
  }

  var song = data.birthSong;

  var html =
    "<div class='song-hero'>" + escapeHtml(song.title) + "</div>" +
    "<div class='artist'>" + escapeHtml(song.artist) + "</div>";

  if (song.startDateFormatted) {
    html +=
      "<div class='note'>Became No. 1 on " +
      escapeHtml(song.startDateFormatted) +
      "</div>";
  }

  html +=
    "<div class='note' style='margin-top:10px'>" +
    escapeHtml(song.blurb || "No database blurb available.") +
    "</div>";

  // Spotify embed
  if (song.spotify && song.spotify.embedUrl) {
    html +=
      "<div class='spotify-embed'>" +
        "<iframe src='" + escapeHtml(song.spotify.embedUrl) + "'></iframe>" +
      "</div>";
  }

  // Image buttons
  var spotifyUrl =
    (song.spotify && song.spotify.url) ||
    "https://open.spotify.com/search/" +
      encodeURIComponent(song.title + " " + song.artist);

  var appleUrl =
    "https://music.apple.com/us/search?term=" +
    encodeURIComponent(song.title + " " + song.artist);

  html += renderMusicButtons(spotifyUrl, appleUrl);

  birthResult.innerHTML = html;
}

/* =========================
   📅 YEARLY TIMELINE (NEW)
========================= */
function renderYearlySongs(rows) {
  if (!rows || rows.length === 0) {
    yearlyResult.innerHTML = "No matches found.";
    return;
  }

  var html = "";

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var triviaId = "trivia-" + row.year;

    html +=
      "<div class='year-card year-card-rich'>" +

        "<div class='year-meta'>" +
          "<span>" + escapeHtml(row.year) + "</span>" +
          "<span> • Age " + escapeHtml(row.age) + "</span>" +
        "</div>" +

        "<div class='year-card-body'>" +

          "<img class='year-art' src='" +
            escapeHtml(row.albumImage) +
            "' loading='lazy'>" +

          "<div class='year-copy'>" +

            "<div class='year-song-title'>" +
              escapeHtml(row.title) +
            "</div>" +

            "<div class='year-song-artist'>" +
              escapeHtml(row.artist) +
            "</div>" +

            renderMusicButtons(row.spotifyUrl, row.appleMusicUrl) +

            "<button class='trivia-toggle' aria-controls='" +
              triviaId +
              "' aria-expanded='false'>" +
              "Trivia <span class='trivia-caret'>▾</span>" +
            "</button>" +

            "<div class='year-trivia' id='" +
              triviaId +
              "' hidden>" +
              escapeHtml(row.blurb || "No trivia available.") +
            "</div>" +

          "</div>" +
        "</div>" +
      "</div>";
  }

  yearlyResult.innerHTML = html;
  attachTriviaToggles();
}

/* =========================
   🔽 TRIVIA TOGGLE
========================= */
function attachTriviaToggles() {
  var toggles = yearlyResult.querySelectorAll(".trivia-toggle");

  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener("click", function () {
      var controlsId = this.getAttribute("aria-controls");
      var panel = document.getElementById(controlsId);
      var expanded = this.getAttribute("aria-expanded") === "true";

      // close all others
      var allPanels = yearlyResult.querySelectorAll(".year-trivia");
      var allButtons = yearlyResult.querySelectorAll(".trivia-toggle");

      for (var j = 0; j < allPanels.length; j++) {
        allPanels[j].hidden = true;
      }
      for (var j = 0; j < allButtons.length; j++) {
        allButtons[j].setAttribute("aria-expanded", "false");
      }

      // toggle current
      this.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (panel) panel.hidden = expanded;
    });
  }
}

/* =========================
   🚀 SUBMIT FLOW
========================= */
function finishAfterMinimum(startTime, callback) {
  var minimumLoadingTime = 3000;
  var elapsed = Date.now() - startTime;
  var remaining = Math.max(0, minimumLoadingTime - elapsed);
  setTimeout(callback, remaining);
}

function resetButton() {
  if (!goButton) return;
  goButton.disabled = false;
  goButton.textContent = "Find my songs";
}

function submit() {
  var birthday = birthdayInput && birthdayInput.value;
  if (!birthday) return;

  goButton.disabled = true;
  goButton.textContent = "Loading...";

  setLoading(true);
  var startTime = Date.now();

  fetch("/api/birthday?date=" + encodeURIComponent(birthday))
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.error || "Error");
        }
        return data;
      });
    })
    .then(function (data) {
      finishAfterMinimum(startTime, function () {
        if (data.range && rangeNote) {
          rangeNote.textContent =
            "Available data: " +
            data.range.minFormatted +
            " - " +
            data.range.maxFormatted;
        }

        showResults();
        renderBirthSong(data);
        renderYearlySongs(data.yearly);

        resetButton();
        setLoading(false);
      });
    })
    .catch(function (error) {
      finishAfterMinimum(startTime, function () {
        showResults();

        birthResult.innerHTML =
          error.message || "Something went wrong.";
        yearlyResult.innerHTML = "";

        resetButton();
        setLoading(false);
      });
    });
}

/* =========================
   🎯 EVENTS
========================= */
if (goButton) {
  goButton.addEventListener("click", submit);
}

if (birthdayInput) {
  birthdayInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });
}
