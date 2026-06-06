document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("drag-trivia-finder");
  var zipInput = document.getElementById("finder-zip");
  var status = document.getElementById("finder-status");
  var results = document.getElementById("finder-results");
  var summary = document.getElementById("finder-summary");
  var googleLink = document.getElementById("finder-google");
  var mapsLink = document.getElementById("finder-maps");
  var yelpLink = document.getElementById("finder-yelp");
  var embedWrap = document.getElementById("finder-embed-wrap");
  var embed = document.getElementById("finder-embed");

  if (!form || !zipInput || !status || !results || !summary || !googleLink || !mapsLink || !yelpLink || !embedWrap || !embed) {
    return;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var zip = zipInput.value.trim();
    var normalizedZip = zip.replace(/\s+/g, "");

    if (!/^\d{5}(?:-\d{4})?$/.test(normalizedZip)) {
      status.textContent = "Enter a valid ZIP code, like 97205 or 97205-1234.";
      results.hidden = true;
      return;
    }

    var searchPhrase = "Drag Trivia near " + normalizedZip;
    var encodedSearch = encodeURIComponent(searchPhrase);
    var encodedYelp = encodeURIComponent("Drag Trivia " + normalizedZip);
    var mapEmbedQuery = encodeURIComponent("drag trivia " + normalizedZip);

    googleLink.href = "https://www.google.com/search?q=" + encodedSearch;
    mapsLink.href = "https://www.google.com/maps/search/" + encodedSearch;
    yelpLink.href = "https://www.yelp.com/search?find_desc=" + encodedYelp;
    embed.src = "https://www.google.com/maps?q=" + mapEmbedQuery + "&output=embed";

    summary.textContent = 'Showing map results for "' + searchPhrase + '" below.';
    status.textContent = "Your map results are loaded on this page.";
    results.hidden = false;
    embedWrap.hidden = false;
  });
});
