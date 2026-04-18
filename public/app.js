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
    requestAnimationFrame(function() {
      loadingOverlay.classList.add("active");
      loadingOverlay.setAttribute("aria-hidden", "false");
    });
  } else {
    loadingOverlay.classList.remove("active");
    loadingOverlay.setAttribute("aria-hidden", "true");

    setTimeout(function() {
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

function renderBirthSong(data) {
  if (!data || !data.birthSong) {
    birthResult.innerHTML = "No data found.";
    return;
  }

  var title = data.birthSong.title || "";
  var artist = data.birthSong.artist || "";
  var blurb = data.birthSong.blurb
    ? data.birthSong.blurb
    : "No database blurb available.";

  var query = title + " " + artist;
  var spotifyUrl = "https://open.spotify.com/search/" + encodeURIComponent(query);
  var appleMusicUrl = "https://music.apple.com/us/search?term=" + encodeURIComponent(query);

  birthResult.innerHTML =
    "<div class='song-hero'>" + title + "</div>" +
    "<div class='artist'>" + artist + "</div>" +
    "<div class='note'>Became No. 1 on " + data.birthSong.startDateFormatted + "</div>" +
    "<div class='note' style='margin-top:10px'>" + blurb + "</div>" +
    "<div class='song-actions'>" +
      "<a class='music-link spotify' href='" + spotifyUrl + "' target='_blank' rel='noopener noreferrer'>ⓢ Listen on Spotify</a>" +
      "<a class='music-link apple' href='" + appleMusicUrl + "' target='_blank' rel='noopener noreferrer'> Listen on Apple Music</a>" +
    "</div>";
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
          "<div class='age'>When you were " + row.age + "</div>" +
          "<div class='year'>" + row.year + "</div>" +
        "</div>" +
        "<div class='song-title'>" + row.title + "</div>" +
        "<div class='artist'>" + row.artist + "</div>" +
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
  var birthday = birthdayInput.value;

  if (!birthday) {
    return;
  }

  goButton.disabled = true;
  goButton.textContent = "Loading...";
  setLoading(true);

  var startTime = Date.now();

  fetch("/api/birthday?date=" + encodeURIComponent(birthday))
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error("Error");
        return data;
      });
    })
    .then(function(data) {
      finishAfterMinimum(startTime, function() {
        rangeNote.textContent =
          "Available: " + data.range.minFormatted + " - " + data.range.maxFormatted;

        showResults();
        renderBirthSong(data);
        renderYearlySongs(data.yearly);

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
        setLoading(false);
      });
    })
    .catch(function() {
      finishAfterMinimum(startTime, function() {
        showResults();
        birthResult.innerHTML = "Something went wrong.";
        yearlyResult.innerHTML = "";

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
        setLoading(false);
      });
    });
}

goButton.addEventListener("click", submit);

birthdayInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    submit();
  }
});
