document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("drag-trivia-finder");
  var zipInput = document.getElementById("finder-zip");
  var status = document.getElementById("finder-status");
  var results = document.getElementById("finder-results");
  var summary = document.getElementById("finder-summary");
  var googleLink = document.getElementById("finder-google");
  var mapsLink = document.getElementById("finder-maps");
  var yelpLink = document.getElementById("finder-yelp");

  if (!form || !zipInput || !status || !results || !summary || !googleLink || !mapsLink || !yelpLink) {
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

    googleLink.href = "https://www.google.com/search?q=" + encodedSearch;
    mapsLink.href = "https://www.google.com/maps/search/" + encodedSearch;
    yelpLink.href = "https://www.yelp.com/search?find_desc=" + encodedYelp;

    summary.textContent = 'Search results prepared for "' + searchPhrase + '."';
    status.textContent = "Choose a search option below.";
    results.hidden = false;
  });
});
