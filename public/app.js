console.log("Life Tracks loaded");

var birthdayInput = document.getElementById("birthday");
var goButton = document.getElementById("go");
var rangeNote = document.getElementById("rangeNote");
var birthResult = document.getElementById("birthResult");
var yearlyResult = document.getElementById("yearlyResult");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    "<div class='note'>No.1 from " + data.birthSong.startDateFormatted + "</div>" +
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
    birthResult.innerHTML = "Please select a date.";
    yearlyResult.innerHTML = "";
    return;
  }

  goButton.disabled = true;
  goButton.textContent = "Loading...";

  birthResult.innerHTML = "Loading...";
  yearlyResult.innerHTML = "";

  fetch("/api/birthday?date=" + encodeURIComponent(birthday))
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error("Error");
        return data;
      });
    })
    .then(function(data) {
      rangeNote.textContent =
        "Available: " + data.range.minFormatted + " - " + data.range.maxFormatted;

      renderBirthSong(data);
      renderYearlySongs(data.yearly);
    })
    .catch(function() {
      birthResult.innerHTML = "Something went wrong.";
      yearlyResult.innerHTML = "";
    })
    .finally(function() {
      goButton.disabled = false;
      goButton.textContent = "Find my songs";
    });
}

goButton.addEventListener("click", submit);

birthdayInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") submit();
});
