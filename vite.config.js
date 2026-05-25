import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite blocks requests from "unknown" hosts as a CSRF / DNS-rebinding
// guard.  Because we expose the dev server through cloudflared / ngrok
// during development (URL changes every restart), maintaining an
// allow-list by hand is painful and out-of-date the moment you reboot
// the tunnel.  Setting `allowedHosts: true` accepts every Host header —
// safe for *dev only* and matches the production reality (the deployed
// build is served by a normal HTTP server with no host check at all).
//
// If you'd rather lock this down again, replace `true` with an array
// of explicit hostnames.
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    // Bind to 0.0.0.0 so the dev server is also reachable from other
    // devices on the LAN (e.g. testing the OA on your phone via your
    // laptop's IP) — not just localhost.
    host: true,
  },
});
