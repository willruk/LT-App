const birthdayInput = document.getElementById("birthday");
    const goButton = document.getElementById("go");
    const rangeNote = document.getElementById("rangeNote");
    const birthResult = document.getElementById("birthResult");
    const yearlyResult = document.getElementById("yearlyResult");

    function escapeHtml(str) {
      return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function renderBirthSong(data) {
      const blurb = data.birthSong.blurb
        ? escapeHtml(data.birthSong.blurb)
        : "No database blurb has been added for this track yet.";

      birthResult.innerHTML = `
        <div class="song-hero">${escapeHtml(data.birthSong.title)}</div>
        <div class="artist">${escapeHtml(data.birthSong.artist)}</div>
        <div class="meta">
          No.1 from ${escapeHtml(data.birthSong.startDateFormatted)}<br/>
          ${data.birthSong.endDateFormatted ? `to ${escapeHtml(data.birthSong.endDateFormatted)}` : "(end date unknown)"}
        </div>
        <div class="db-blurb">
          <span class="label">About this track</span>
          ${blurb}
        </div>
      `;
    }

    function renderYearlySongs(rows) {
      if (!rows.length) {
        yearlyResult.innerHTML = '<p class="error">No later birthday matches were found in the available data.</p>';
        return;
      }

      const cards = rows.map((row) => `
        <div class="year-card">
          <div class="year-header">
            <div class="age">When you were ${row.age}</div>
            <div class="year">${row.year}</div>
          </div>
          <div class="year-song-row">
            <div class="year-label">Number One Song</div>
            <div class="year-value year-song">${escapeHtml(row.title)}</div>
          </div>
          <div class="year-artist-row">
            <div class="year-label">Artist</div>
            <div class="year-value year-artist">${escapeHtml(row.artist)}</div>
          </div>
        </div>
      `).join("");

      yearlyResult.innerHTML = `
        <div class="small">${rows.length} birthday chart match${rows.length === 1 ? "" : "es"} found.</div>
        <div class="year-grid">${cards}</div>
      `;
    }

    async function submit() {
      const birthday = birthdayInput.value;
      if (!birthday) {
        birthResult.innerHTML = '<p class="error">Please choose a birthday first.</p>';
        yearlyResult.innerHTML = 'Your annual birthday chart history will appear here.';
        return;
      }

      goButton.disabled = true;
      goButton.textContent = 'Loading…';

      try {
        const res = await fetch(`/api/birthday?date=${encodeURIComponent(birthday)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        rangeNote.textContent = `Available chart data: ${data.range.minFormatted} to ${data.range.maxFormatted}.`;
        renderBirthSong(data);
        renderYearlySongs(data.yearly);
      } catch (error) {
        birthResult.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        yearlyResult.innerHTML = 'Choose a birthday within the database range to see the yearly list.';
      } finally {
        goButton.disabled = false;
        goButton.textContent = 'Find my songs';
      }
    }

    goButton.addEventListener('click', submit);
    birthdayInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });