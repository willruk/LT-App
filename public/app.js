console.log("Life Tracks loaded");

var birthdayInput = document.getElementById("birthday");
var goButton = document.getElementById("go");
var rangeNote = document.getElementById("rangeNote");
var birthResult = document.getElementById("birthResult");
var yearlyResult = document.getElementById("yearlyResult");
var loadingOverlay = document.getElementById("loadingOverlay");
var resultsSection = document.getElementById("resultsSection");

function showResults() {
  if (resultsSection) {
    resultsSection.classList.remove("hidden");
  }
}

function setLoading(isLoading) {
  if (!loadingOverlay) return;

  if (isLoading) {
    loadingOverlay.classList.add("active");
    loadingOverlay.setAttribute("aria-hidden", "false");
  } else {
    loadingOverlay.classList.remove("active");
    loadingOverlay.setAttribute("aria-hidden", "true");
  }
}

function renderBirthSong(data) {
  if (!data || !data.birthSong) {
    birthResult.innerHTML = "No data found.";
    return;
  }

  var blurb = data.birthSong.blurb
    ? data.birthSong.blurb
    : "No database blurb available.";

  birthResult.innerHTML =
    "<div class='song-hero'>" + data.birthSong.title + "</div>" +
    "<div class='artist'>" + data.birthSong.artist + "</div>" +
    "<div class='note'>Became No.1 on " + data.birthSong.startDateFormatted + "</div>" +
    "<div class='note' style='margin-top:10px'>" + blurb + "</div>";
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
          "<div>When you were " + row.age + "</div>" +
          "<div class='year'>" + row.year + "</div>" +
        "</div>" +
        "<div>" + row.title + "</div>" +
        "<div class='artist'>" + row.artist + "</div>" +
      "</div>";
  }

  yearlyResult.innerHTML = html;
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
  var minimumLoadingTime = 2000;

  fetch("/api/birthday?date=" + encodeURIComponent(birthday))
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error("Error");
        return data;
      });
    })
    .then(function(data) {
      var elapsed = Date.now() - startTime;
      var remaining = Math.max(0, minimumLoadingTime - elapsed);

      setTimeout(function() {
        rangeNote.textContent =
          "Available: " + data.range.minFormatted + " - " + data.range.maxFormatted;

        showResults();
        renderBirthSong(data);
        renderYearlySongs(data.yearly);

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
        setLoading(false);
      }, remaining);
    })
    .catch(function() {
      var elapsed = Date.now() - startTime;
      var remaining = Math.max(0, minimumLoadingTime - elapsed);

      setTimeout(function() {
        showResults();
        birthResult.innerHTML = "Something went wrong.";
        yearlyResult.innerHTML = "";

        goButton.disabled = false;
        goButton.textContent = "Find my songs";
        setLoading(false);
      }, remaining);
    });
}

goButton.addEventListener("click", submit);

birthdayInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") submit();
});
