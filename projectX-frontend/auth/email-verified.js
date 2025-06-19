// email-verified.js
// Get current host and protocol
const baseUrl =
  window.location.protocol +
  "//" +
  window.location.host.replace(/:\d+$/, ":3000");

// Update the button's href
document.getElementById(
  "continueBtn"
).href = `${baseUrl}/projectX-frontend/login.html?verified=true`;

// Optional: Log for debugging
console.log(
  "Redirect URL:",
  `${baseUrl}/projectX-frontend/login.html?verified=true`
);
