// ADD THESE HELPERS near your other functions

function buildAppleMusicUrl(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`);
  return `https://music.apple.com/us/search?term=${q}`;
}

function buildSpotifyUrl(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`);
  return `https://open.spotify.com/search/${q}`;
}

function buildFallbackArtwork(title, artist) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="100%" height="100%" fill="#0b0b0f"/>
    <circle cx="200" cy="200" r="150" fill="#111"/>
    <circle cx="200" cy="200" r="60" fill="#ff3be2"/>
    <text x="200" y="190" font-size="14" fill="#000" text-anchor="middle">${title}</text>
    <text x="200" y="215" font-size="12" fill="#000" text-anchor="middle">${artist}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
