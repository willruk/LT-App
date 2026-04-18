var birthdayInput = document.getElementById("birthday");
var goButton = document.getElementById("go");
var birthResult = document.getElementById("birthResult");
var yearlyResult = document.getElementById("yearlyResult");

function showResults() {
  document.querySelector(".wrap").classList.add("results-active");
  document.getElementById("birthCard").style.display = "block";
  document.getElementById("yearlyCard").style.display = "block";
}

function renderBirthSong(data) {
  const s = data.birthSong;

  let html = `
    <div class="song-hero">${s.title}</div>
    <div class="artist">${s.artist}</div>
  `;

  if (s.spotify?.embed) {
    html += `<iframe src="${s.spotify.embed}" width="100%" height="152"></iframe>`;
  }

  birthResult.innerHTML = html;
}

function renderYearly(rows) {
  yearlyResult.innerHTML = rows.map(r => `
    <div class="year-card">
      <div>${r.year}</div>
      <div>${r.title}</div>
      <div>${r.artist}</div>
    </div>
  `).join("");
}

async function submit() {
  const date = birthdayInput.value;
  if (!date) return;

  const res = await fetch(`/api/birthday?date=${date}`);
  const data = await res.json();

  showResults();
  renderBirthSong(data);
  renderYearly(data.yearly);
}

goButton.onclick = submit;
