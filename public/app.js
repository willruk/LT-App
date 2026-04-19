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

  if (birthCard) {
    birthCard.style.display = "block";
  }

  if (yearlyCard) {
    yearlyCard.style.display = "block";
  }

  if (wrap) {
    wrap.classList.add("results-active");
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(str) {
  return String(str || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchLinks(title, artist) {
  var safeTitle = cleanText(title);
  var safeArtist = cleanText(artist);
  var query = (safeTitle + " " + safeArtist).trim();

  return {
    spotify: "https://open.spotify.com/search/" + encodeURIComponent(query),
    apple: "https://music.apple.com/us/search?term=" + encodeURIComponent(query)
  };
}

function renderBirthSong(data) {
  if (!data || !data.birthSong) {
    birthResult.innerHTML = "No data found.";
    return;
  }

  var song = data.birthSong;
  var title = song.title || "";
  var artist = song.artist || "";
  var blurb = song.blurb ? song.blurb : "No database blurb available.";
  var links = buildSearchLinks(title, artist);

  var html =
    "<div class='song-hero'>" + escapeHtml(title) + "</div>" +
    "<div class='artist'>" + escapeHtml(artist) + "</div>";

  if (song.startDateFormatted) {
    html +=
      "<div class='note'>Became No. 1 on " +
      escapeHtml(song.startDateFormatted) +
      "</div>";
  }

  html +=
    "<div class='note' style='margin-top:10px'>" +
    escapeHtml(blurb) +
    "</div>";

  if (song.spotify && song.spotify.embedUrl) {
    html +=
      "<div class='spotify-embed'>" +
        "<iframe" +
          " src='" + escapeHtml(song.spotify.embedUrl) + "'" +
          " allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'" +
          " loading='lazy'" +
          " title='Spotify player for " + escapeHtml(title) + " by " + escapeHtml(artist) + "'" +
        "></iframe>" +
      "</div>";
  }

  html += "<div class='song-actions'>";

  if (song.spotify && song.spotify.url) {
    html +=
      "<a class='music-link spotify' href='" +
      escapeHtml(song.spotify.url) +
      "' target='_blank' rel='noopener noreferrer'>ⓢ Open in Spotify</a>";
  } else {
    html +=
      "<a class='music-link spotify' href='" +
      escapeHtml(links.spotify) +
      "' target='_blank' rel='noopener noreferrer'>ⓢ Find on Spotify</a>";
  }

  html +=
    "<a class='music-link apple' href='" +
    escapeHtml(links.apple) +
    "' target='_blank' rel='noopener noreferrer'> Find on Apple Music</a>" +
    "</div>";

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

    html +=
      "<div class='year-card'>" +
        "<div class='year-header'>" +
          "<div class='age'>When you were " + escapeHtml(row.age) + "</div>" +
          "<div class='year'>" + escapeHtml(row.year) + "</div>" +
        "</div>" +
        "<div class='song-title'>" + escapeHtml(row.title) + "</div>" +
        "<div class='artist'>" + escapeHtml(row.artist) + "</div>" +
      "</div>";
  }

  yearlyResult.innerHTML = html;
}

function finishAfterMinimum(startTime, callback) {
  var minimumLoadingTime = 3000;
  var elapsed = Date.now() - startTime;
  var remaining = Math.max(0, minimumLoadingTime - elapsed);
  setTimeout(callback, remaining);
}

function submit() {
  var birthday = birthdayInput && birthdayInput.value;

  if (!birthday) {
    return;
  }

  goButton.disabled = true;
  goButton.textContent = "Loading...";
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
        if (data.range && data.range.minFormatted && data.range.maxFormatted) {
          rangeNote.textContent =
            "Available data: " +
            data.range.minFormatted +
            " - " +
            data.range.maxFormatted;
        } else {
          rangeNote.textContent = "";
        }

        showResults();
        renderBirthSong(data);
        renderYearlySongs(data.yearly);

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
        setLoading(false);
      });
    })
    .catch(function (error) {
      finishAfterMinimum(startTime, function () {
        showResults();
        birthResult.innerHTML =
          error && error.message
            ? escapeHtml(error.message)
            : "Something went wrong.";
        yearlyResult.innerHTML = "";

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
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
