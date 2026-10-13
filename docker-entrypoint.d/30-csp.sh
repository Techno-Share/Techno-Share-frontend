#!/bin/sh
# Generates the response security headers, including the Content-Security
# Policy, into /etc/nginx/snippets/security-headers.conf before nginx starts.
#
# ── Why a script and not a static conf ───────────────────────────────────────
# Three of the CSP's sources are deployment facts, not code facts: where the API
# lives, where object storage lives, and whether either is HTTPS. Baking them
# into the image would mean a rebuild per environment, and writing them by hand
# per environment means the WebSocket origin gets forgotten — the SPA keeps
# working, notifications silently stop, and nobody connects the two.
#
# Run by the nginx image's own entrypoint, which executes /docker-entrypoint.d/*.sh
# in order before starting the server.
#
# ── Inputs ──────────────────────────────────────────────────────────────────
#   API_ORIGIN               scheme://host[:port] of the backend   (default http://localhost:3000)
#   STORAGE_ORIGIN           scheme://host[:port] of MinIO / S3    (default http://localhost:9000)
#   CSP_ALLOW_OFFICE_VIEWER  "false" drops the Microsoft fallback  (default: allowed)
#   CSP_REPORT_URI           if set, violations are POSTed there
#   CSP_REPORT_ONLY          "true" reports without blocking — use this first
#   CSP_EXTRA                appended verbatim; the escape hatch
set -eu

API_ORIGIN="${API_ORIGIN:-http://localhost:3000}"
STORAGE_ORIGIN="${STORAGE_ORIGIN:-http://localhost:9000}"

# Socket.IO opens with HTTP long-polling and then upgrades, so both schemes have
# to be allowed for the same host. Derived rather than asked for: an operator who
# has to supply it by hand is an operator who will one day not.
case "$API_ORIGIN" in
  https://*) WS_ORIGIN="wss://${API_ORIGIN#https://}" ;;
  http://*)  WS_ORIGIN="ws://${API_ORIGIN#http://}" ;;
  *)         echo "30-csp.sh: API_ORIGIN must start with http:// or https:// (got '$API_ORIGIN')" >&2; exit 1 ;;
esac

case "$STORAGE_ORIGIN" in
  http://*|https://*) ;;
  *) echo "30-csp.sh: STORAGE_ORIGIN must start with http:// or https:// (got '$STORAGE_ORIGIN')" >&2; exit 1 ;;
esac

# The Office Online fallback is only reached when a file has no server-generated
# PDF rendition. It hands Microsoft the document's URL, so it is listed as a
# source rather than assumed, and can be switched off in one variable.
# Cloudflare injects its Web Analytics beacon into every HTML response on
# this zone. Named once so script-src and connect-src cannot drift apart.
CF_INSIGHTS="https://static.cloudflareinsights.com"
OFFICE_VIEWER="https://view.officeapps.live.com"
[ "${CSP_ALLOW_OFFICE_VIEWER:-true}" = "false" ] && OFFICE_VIEWER=""

# Only when every origin in the policy is already HTTPS. Switching it on while
# the API or MinIO is still served over HTTP would rewrite those requests to a
# port that is not listening.
UPGRADE=""
case "$API_ORIGIN$STORAGE_ORIGIN" in
  https://*https://*) UPGRADE=" upgrade-insecure-requests;" ;;
esac

REPORT=""
[ -n "${CSP_REPORT_URI:-}" ] && REPORT=" report-uri ${CSP_REPORT_URI};"

HEADER="Content-Security-Policy"
[ "${CSP_REPORT_ONLY:-false}" = "true" ] && HEADER="Content-Security-Policy-Report-Only"

# Each source below is here because something in the app needs it:
#
#   script-src 'self'      Vite emits hashed module scripts and no inline
#                          script — the built index.html has none, so no nonce
#                          and no 'unsafe-inline'. Note: pdf.js ships WASM
#                          decoders for JPEG2000/JBIG2, but nothing configures
#                          wasmUrl and no .wasm is emitted into the bundle. If
#                          that is ever wired up, this needs 'wasm-unsafe-eval'.
#   style-src 'self'       All CSS is a build-time stylesheet. pdf.js does append
#                          a <style> element, but leaves it empty and fills it
#                          through CSSOM insertRule, which CSP does not govern —
#                          so this does NOT need 'unsafe-inline'. Vue's :style
#                          bindings are CSSOM too.
#   img-src  data:         An inline SVG data URI in the preview modal.
#            blob:         Local previews of a file the user just picked.
#            storage       Avatars, book covers, subject covers, department logos.
#   font-src 'self' data:  Nunito is bundled; data: is pdf.js's fallback path for
#                          fonts embedded in a PDF.
#   connect-src            XHR to the API, the Socket.IO upgrade, and pdf.js
#                          fetching PDF bytes straight from storage.
#   worker-src 'self'      The pdf.js worker is emitted as a same-origin asset.
#            blob:         pdf.js's wrapper path, used if the worker ever moves
#                          cross-origin.
#   child-src              The SAME sources, for Safari. worker-src is CSP
#                          Level 3 and WebKit only implemented it in 15.4;
#                          before that a worker falls back to child-src, and
#                          failing that to default-src — which is 'none' here.
#                          So the pdf.js worker loads in Chrome and is refused
#                          in Safari, which is a difference nothing in the app
#                          can see. Browsers that do support worker-src ignore
#                          child-src for workers, so this costs them nothing.
#                          It must stay in step with worker-src above.
#   script-src             Cloudflare's Web Analytics beacon, which it injects
#   connect-src            into every HTML response on this zone; the beacon
#                          both loads from and reports back to that origin.
#                          Allowed deliberately, because the analytics are used.
#                          Disabling automatic setup in the Cloudflare dashboard
#                          would be the stricter choice — every extra script-src
#                          origin is one more place a compromise could inject
#                          code into the page.
#   object-src             Document previews are <object type="application/pdf">.
#   frame-src              BOTH are required, and this was the bug: an earlier
#                          version set only object-src, on the reasoning that an
#                          <object> is not an <iframe>. Chrome disagrees — it
#                          renders a PDF <object> in a nested browsing context
#                          and checks frame-src too, so the preview was refused
#                          with "Framing ... violates default-src 'none'" while
#                          object-src allowed it. 'self' is harmless in both:
#                          this origin serves only the static build, and every
#                          upload lives in storage.
#
# Everything else falls through to default-src 'none': no media, no manifest,
# no <base>, nothing.
cat > /etc/nginx/snippets/security-headers.conf <<CONF
# GENERATED by /docker-entrypoint.d/30-csp.sh — edit that script, not this file.
#
# Included by every location that sets an add_header of its own: nginx drops
# ALL inherited add_header directives the moment a block declares one, so a
# policy set only at server level would be missing from exactly the responses
# that matter most.
add_header ${HEADER} "default-src 'none'; script-src 'self' ${CF_INSIGHTS}; style-src 'self'; img-src 'self' data: blob: ${STORAGE_ORIGIN}; font-src 'self' data:; connect-src 'self' ${API_ORIGIN} ${WS_ORIGIN} ${STORAGE_ORIGIN} ${CF_INSIGHTS}; worker-src 'self' blob:; child-src 'self' blob:; object-src 'self' ${STORAGE_ORIGIN} ${OFFICE_VIEWER}; frame-src 'self' ${STORAGE_ORIGIN} ${OFFICE_VIEWER}; base-uri 'none'; form-action 'self'; frame-ancestors 'none';${UPGRADE}${REPORT} ${CSP_EXTRA:-}" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
CONF

echo "30-csp.sh: ${HEADER} set — api=${API_ORIGIN} ws=${WS_ORIGIN} storage=${STORAGE_ORIGIN}"
