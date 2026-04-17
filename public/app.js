const birthdayInput = document.getElementById("birthday");
const goButton = document.getElementById("go");
const rangeNote = document.getElementById("rangeNote");
const birthResult = document.getElementById("birthResult");
const yearlyResult = document.getElementById("yearlyResult");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBirthSong(data) {
const blurb = data.birthSong.blurb
? escapeHtml(data.birthSong.blurb)
: "No database blurb available.";

birthResult.innerHTML = `     <div class="song-hero">${escapeHtml(data.birthSong.title)}</div>     <div class="artist">${escapeHtml(data.birthSong.artist)}</div>     <div class="note">
      No.1 from ${escapeHtml(data.birthSong.startDateFormatted)}     </div>     <div class="note" style="margin-top:10px">${blurb}</div>
  `;
}

function renderYearlySongs(rows) {
  if (!rows.length) {
    yearlyResult.innerHTML = "No matches found.";
    return;
  }

  const html = rows.map(row => {
    return `
      <div class="year-card">
        <div class="year-header">
          <div>When you were ${row.age}</div>
          <div class="year">${row.year}</div>
        </div>
        <div>${escapeHtml(row.title)}</div>
        <div class="artist">${escapeHtml(row.artist)}</div>
      </div>
    `;
  }).join("");

  yearlyResult.innerHTML = html;
};
return;
}

yearlyResult.innerHTML = rows.map(row => `     <div class="year-card">       <div class="year-header">         <div>When you were ${row.age}</div>         <div class="year">${row.year}</div>       </div>       <div>${escapeHtml(row.title)}</div>       <div class="artist">${escapeHtml(row.artist)}</div>     </div>
  `).join("");
}

async function submit() {
const birthday = birthdayInput.value;
if (!birthday) return;

goButton.disabled = true;
goButton.textContent = "Loading...";

try {
const res = await fetch(`/api/birthday?date=${birthday}`);
const data = await res.json();

```
if (!res.ok) throw new Error("Error");

rangeNote.textContent =
  `Available: ${data.range.minFormatted} - ${data.range.maxFormatted}`;

renderBirthSong(data);
renderYearlySongs(data.yearly);
```

} catch (err) {
birthResult.innerHTML = "Error loading data";
}

goButton.disabled = false;
goButton.textContent = "Find my songs";
}

goButton.addEventListener("click", submit);
birthdayInput.addEventListener("keydown", e => {
if (e.key === "Enter") submit();
});
