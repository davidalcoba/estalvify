#!/usr/bin/env bash
# PostToolUse hook: after a `git push` or after opening a PR, look up the Vercel
# deployment for the current branch and inject its URL + state into the model
# context (hookSpecificOutput.additionalContext) so the session reports it.
#
# Fails open / silently: exits 0 without output whenever it can't help
# (no VERCEL_TOKEN in the environment, no network, non-push Bash command, etc.),
# so it never blocks a tool call.
set -uo pipefail

PROJECT_ID="prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI"

INPUT="$(cat)"

# Gate: only proceed for `git push` Bash commands, or non-Bash matched tools
# (e.g. the create_pull_request MCP tool). Anything else → skip quietly.
printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
tn = d.get("tool_name", "")
if tn == "Bash":
    cmd = (d.get("tool_input") or {}).get("command", "")
    sys.exit(0 if "git push" in cmd else 1)
sys.exit(0)
' || exit 0

# Need a token to query the Vercel API.
[ -n "${VERCEL_TOKEN:-}" ] || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || exit 0
[ -n "$BRANCH" ] || exit 0

CA="/root/.ccr/ca-bundle.crt"
CACERT=()
[ -f "$CA" ] && CACERT=(--cacert "$CA")

RESP="$(curl -s -m 15 "${CACERT[@]}" -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=20" 2>/dev/null)" || exit 0
[ -n "$RESP" ] || exit 0

RESP="$RESP" PROJECT_ID="$PROJECT_ID" BRANCH="$BRANCH" python3 <<'PY'
import json, os, sys

branch = os.environ["BRANCH"]
pid = os.environ["PROJECT_ID"]
try:
    d = json.loads(os.environ["RESP"])
except Exception:
    sys.exit(0)

deps = [x for x in d.get("deployments", [])
        if (x.get("meta") or {}).get("githubCommitRef") == branch]

if deps:
    x = max(deps, key=lambda z: z.get("created", 0))
    url = "https://" + x.get("url", "")
    state = x.get("state", "?")
    target = x.get("target") or "preview"
    ctx = (
        f'Vercel {target} deployment for branch "{branch}": {url} (state: {state}). '
        f'Report this URL to the user. If state is BUILDING it will be READY shortly — '
        f'offer to re-check. Preview URLs require a Vercel team login to open.'
    )
else:
    ctx = (
        f'Vercel: no deployment is registered yet for branch "{branch}" — the build '
        f'is probably just starting. Re-query '
        f'https://api.vercel.com/v6/deployments?projectId={pid}&target=preview in '
        f'~30-60s and report the preview URL to the user.'
    )

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": ctx,
    }
}))
PY
