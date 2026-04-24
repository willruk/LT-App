console.log("vinyl found:", !!vinyl);
console.log("Life Tracks loaded");

var birthdayInput = document.getElementById("birthday");
var goButton = document.getElementById("go");
var rangeNote = document.getElementById("rangeNote");
var birthResult = document.getElementById("birthResult");
var yearlyResult = document.getElementById("yearlyResult");
var loadingOverlay = document.getElementById("loadingOverlay");
var yearlyCard = document.getElementById("yearlyCard");
var vinyl = document.querySelector(".vinyl");
var vinylStartupTimeout = null;
var vinylStartupAnimation = null;
var vinylContinuousAnimation = null;
var vinylRafId = null;
var vinylStartTime = 0;
var vinylLastTime = 0;
var vinylAngle = 0;
var vinylRunning = false;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function applyVinylRotation() {
  if (!vinyl) return;
  vinyl.style.transform = "rotate(" + vinylAngle + "deg)";
}

function stopVinylAnimation() {
  vinylRunning = false;

  if (vinylRafId) {
    cancelAnimationFrame(vinylRafId);
    vinylRafId = null;
  }

  vinylStartTime = 0;
  vinylLastTime = 0;
  vinylAngle = 0;

  if (vinyl) {
    vinyl.style.transform = "rotate(0deg)";
  }
}

function startVinylAnimation() {
  if (!vinyl) return;

  stopVinylAnimation();

  vinylRunning = true;
  vinylStartTime = 0;
  vinylLastTime = 0;
  vinylAngle = 0;

  var initialPauseMs = 100;      // starts almost with tonearm
  var rampDurationMs = 2600;     // time to reach full speed
  var fullSpeedDegPerSec = 220;  // tune this for top speed

  function frame(now) {
    if (!vinylRunning) return;

    if (!vinylStartTime) {
      vinylStartTime = now;
      vinylLastTime = now;
    }

    var elapsed = now - vinylStartTime;
    var deltaMs = now - vinylLastTime;
    vinylLastTime = now;

    var speedDegPerSec = 0;

    if (elapsed <= initialPauseMs) {
      speedDegPerSec = 0;
    } else if (elapsed <= initialPauseMs + rampDurationMs) {
      var t = (elapsed - initialPauseMs) / rampDurationMs;
      var eased = easeOutCubic(t);
      speedDegPerSec = fullSpeedDegPerSec * eased;
    } else {
      speedDegPerSec = fullSpeedDegPerSec;
    }

    vinylAngle += speedDegPerSec * (deltaMs / 1000);
    applyVinylRotation();

    vinylRafId = requestAnimationFrame(frame);
  }

  vinylRafId = requestAnimationFrame(frame);
}

function setLoading(isLoading) {
  if (!loadingOverlay) return;

  if (isLoading) {
    startVinylAnimation();

    loadingOverlay.style.display = "flex";
    requestAnimationFrame(function () {
      loadingOverlay.classList.add("active");
      loadingOverlay.setAttribute("aria-hidden", "false");
    });
  } else {
    setTimeout(function () {
  loadingOverlay.classList.remove("active");
  loadingOverlay.setAttribute("aria-hidden", "true");

  setTimeout(function () {
    if (!loadingOverlay.classList.contains("active")) {
      loadingOverlay.style.display = "none";
      stopVinylAnimation();
    }
  }, 600);
}, 250);
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
      "<a href='" + escapeHtml(spotifyUrl) + "' target='_blank' rel='noopener noreferrer' aria-label='Open in Spotify'>" +
        "<img src='/spotify_button_small.png' alt='Spotify'>" +
      "</a>" +
      "<a href='" + escapeHtml(appleUrl) + "' target='_blank' rel='noopener noreferrer' aria-label='Open in Apple Music'>" +
        "<img src='/apple_button_small.png' alt='Apple Music'>" +
      "</a>" +
    "</div>"
  );
}

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

  if (song.spotify && song.spotify.embedUrl) {
    html +=
      "<div class='spotify-embed'>" +
        "<iframe" +
          " src='" + escapeHtml(song.spotify.embedUrl) + "'" +
          " allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'" +
          " loading='lazy'" +
          " title='Spotify player for " + escapeHtml(song.title) + " by " + escapeHtml(song.artist) + "'" +
        "></iframe>" +
      "</div>";
  }

  html += renderMusicButtons(song.spotifyUrl, song.appleMusicUrl);

  birthResult.innerHTML = html;
}

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
        "<div class='year-card-top'>" +
          "<div class='year-meta'>" +
            "<span>" + escapeHtml(row.year) + "</span>" +
            "<span> • Age " + escapeHtml(row.age) + "</span>" +
          "</div>" +
          renderMusicButtons(row.spotifyUrl, row.appleMusicUrl) +
        "</div>" +

        "<div class='year-card-body'>" +
          "<img class='year-art' src='" +
            escapeHtml(row.albumImage) +
            "' alt='Artwork for " + escapeHtml(row.title) + " by " + escapeHtml(row.artist) + "'" +
            " loading='lazy'>" +

          "<div class='year-copy'>" +
            "<div class='year-song-title'>" +
              escapeHtml(row.title) +
            "</div>" +

            "<div class='year-song-artist'>" +
              escapeHtml(row.artist) +
            "</div>" +

            "<button class='trivia-toggle' aria-controls='" +
              triviaId +
              "' aria-expanded='false' type='button'>" +
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

function attachTriviaToggles() {
  var toggles = yearlyResult.querySelectorAll(".trivia-toggle");

  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener("click", function () {
      var controlsId = this.getAttribute("aria-controls");
      var panel = document.getElementById(controlsId);
      var expanded = this.getAttribute("aria-expanded") === "true";

      var allPanels = yearlyResult.querySelectorAll(".year-trivia");
      var allButtons = yearlyResult.querySelectorAll(".trivia-toggle");

      for (var j = 0; j < allPanels.length; j++) {
        allPanels[j].hidden = true;
      }
      for (var k = 0; k < allButtons.length; k++) {
        allButtons[k].setAttribute("aria-expanded", "false");
      }

      this.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (panel) panel.hidden = expanded;
    });
  }
}

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

  if (goButton) {
    goButton.disabled = true;
    goButton.textContent = "Loading...";
  }

  setLoading(true);
  var startTime = Date.now();

  fetch("/api/birthday?date=" + encodeURIComponent(birthday))
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data && data.error ? data.error : "Error");
        }
        return data;
      });
    })
    .then(function (data) {
      finishAfterMinimum(startTime, function () {
        if (data.range && data.range.minFormatted && data.range.maxFormatted && rangeNote) {
          rangeNote.textContent =
            "Available data: " +
            data.range.minFormatted +
            " - " +
            data.range.maxFormatted;
        } else if (rangeNote) {
          rangeNote.textContent = "";
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

        if (birthResult) {
          birthResult.innerHTML =
            error && error.message
              ? escapeHtml(error.message)
              : "Something went wrong.";
        }

        if (yearlyResult) {
          yearlyResult.innerHTML = "";
        }

        resetButton();
        setLoading(false);
      });
    });
}

if (goButton) {
  goButton.addEventListener("click", submit);
}

if (birthdayInput) {
  birthdayInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      submit();
    }
  });
}
