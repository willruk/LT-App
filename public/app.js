console.log("Life Tracks loaded");

// Elements
const birthdayInput = document.getElementById("birthday");
const goButton = document.getElementById("go");
const rangeNote = document.getElementById("rangeNote");
const birthResult = document.getElementById("birthResult");
const yearlyResult = document.getElementById("yearlyResult");

// HTML escaping (temp solution)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Render birth song
function renderBirthSong(data) {
if (!data.birthSong) {
birthResult.innerHTML = '<p class="note">No data found for this date.</p>';
return;
}

const blurb = data.birthSong.blurb
? escapeHtml(data.birthSong.blurb)
: "No database blurb available.";

birthResult.innerHTML =
'<div class="song-hero">' + escapeHtml(data.birthSong.title) + '</div>' +
'<div class="artist">' + escapeHtml(data.birthSong.artist) + '</div>' +
'<div class="note">No.1 from ' + escapeHtml(data.birthSong.startDateFormatted) + '</div>' +
'<div class="note" style="margin-top:10px">' + blurb + '</div>';
}

// Render yearly songs
function renderYearlySongs(rows) {
if (!rows || rows.length === 0) {
yearlyResult.innerHTML = '<p class="note">No yearly matches found.</p>';
return;
}

const html = rows.map(function (row) {
return (
'<div class="year-card">' +
'<div class="year-header">' +
'<div>When you were ' + row.age + '</div>' +
'<div class="year">' + row.year + '</div>' +
'</div>' +
'<div>' + escapeHtml(row.title) + '</div>' +
'<div class="artist">' + escapeHtml(row.artist) + '</div>' +
'</div>'
);
}).join("");

yearlyResult.innerHTML = html;
}

// Submit handler
async function submit() {
const birthday = birthdayInput.value;

if (!birthday) {
birthResult.innerHTML = '<p class="note">Please select a date first.</p>';
yearlyResult.innerHTML = '';
return;
}

goButton.disabled = true;
goButton.textContent = "Loading...";

// Optional loading state
birthResult.innerHTML = '<div class="loading">Loading your track...</div>';
yearlyResult.innerHTML = '';

try {
const res = await fetch("/api/birthday?date=" + encodeURIComponent(birthday));
const data = await res.json();

```
if (!res.ok) {
  throw new Error(data.error || "Failed to fetch data");
}

rangeNote.textContent =
  "Available: " + data.range.minFormatted + " - " + data.range.maxFormatted;

renderBirthSong(data);
renderYearlySongs(data.yearly);
```

} catch (err) {
birthResult.innerHTML = '<p class="note">Something went wrong. Try another date.</p>';
yearlyResult.innerHTML = '';
} finally {
goButton.disabled = false;
goButton.textContent = "Find my songs";
}
}

// Events
goButton.addEventListener("click", submit);

birthdayInput.addEventListener("keydown", function (e) {
if (e.key === "Enter") submit();
});
