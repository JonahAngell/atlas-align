#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-https://blueprints.internal.disneystudiostech.com}"
SCRIPT_VERSION="0d0fa25d4cf6"
MANIFEST=".ste/blueprints.txt"
CURSOR_DIR=".cursor/rules"
CLAUDE_DIR=".claude/rules"

# Self-update: download install script, check version, run if needed
self_update() {
  [[ "${SKIP_UPDATE:-}" == "1" ]] && return 0

  local temp_install
  temp_install=$(mktemp)
  trap "rm -f '$temp_install'" RETURN

  if ! curl -fsSL "${BASE_URL}/install" -o "$temp_install" --max-time 5 2>/dev/null; then
    return 0
  fi

  local remote_version
  remote_version=$(grep -m1 '^SCRIPT_VERSION=' "$temp_install" 2>/dev/null | cut -d'"' -f2 || true)

  [[ -z "$remote_version" || "$remote_version" == "$SCRIPT_VERSION" ]] && return 0

  echo "Updating ste-blueprints: v${SCRIPT_VERSION} → v${remote_version}"
  SKIP_UPDATE=1 bash "$temp_install"
  exec "$0" "$@"
}

self_update "$@"

# Telemetry function - fire and forget, never blocks
# Only tracks projects with a git remote URL
send_telemetry() {
  local blueprints_json="$1"
  local profiles_json="$2"

  local remote_url
  remote_url=$(git config --get remote.origin.url 2>/dev/null || echo "")
  [[ -z "$remote_url" ]] && return 0

  local normalized_url
  normalized_url=$(echo "$remote_url" | sed -E 's#^(https?://|git@)##; s#:#/#; s#\.git$##')

  local project_id
  project_id=$(echo -n "$normalized_url" | shasum -a 256 | cut -d' ' -f1)

  local persistent_id=""
  if [[ -f ".ste/project-id" ]]; then
    persistent_id=$(cat ".ste/project-id")
  else
    persistent_id=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || openssl rand -hex 16 | sed 's/^\(........\)\(....\)\(....\)\(....\)\(............\)$/\1-\2-\3-\4-\5/')
    mkdir -p .ste
    echo "$persistent_id" > .ste/project-id
  fi

  (curl -sS -X POST "${BASE_URL}/api/telemetry" \
    -H "Content-Type: application/json" \
    -d "{\"eventType\":\"update\",\"projectId\":\"$project_id\",\"persistentId\":\"$persistent_id\",\"repoPath\":\"$normalized_url\",\"blueprints\":$blueprints_json,\"profiles\":$profiles_json}" \
    --max-time 5 >/dev/null 2>&1 || true) &
}

PROFILES=()
BLUEPRINTS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--profile) PROFILES+=("$2"); shift 2 ;;
    -h|--help) echo "Usage: $0 [-p profile]... [blueprint]..."; exit 0 ;;
    *) BLUEPRINTS+=("$1"); shift ;;
  esac
done

[[ -f "$MANIFEST" ]] && while IFS= read -r bp; do
  [[ -n "$bp" ]] && BLUEPRINTS+=("$bp")
done < "$MANIFEST"

[[ ${#PROFILES[@]} -eq 0 && ${#BLUEPRINTS[@]} -eq 0 ]] && {
  echo "No blueprints installed. Use: $0 -p <profile> or $0 <blueprint>"
  exit 1
}

QUERY=""
for p in "${PROFILES[@]+"${PROFILES[@]}"}"; do QUERY+="profile=${p}&"; done
for b in "${BLUEPRINTS[@]+"${BLUEPRINTS[@]}"}"; do QUERY+="blueprint=${b}&"; done
QUERY="${QUERY%&}"

BLUEPRINT_LIST=$(curl -sSL -H "X-Script-Version: ${SCRIPT_VERSION}" "${BASE_URL}/api/blueprints?${QUERY}")
[[ "$BLUEPRINT_LIST" == *"not found"* || "$BLUEPRINT_LIST" == *"No profiles"* ]] && {
  echo "Error: $BLUEPRINT_LIST"; exit 1
}

mkdir -p "$(dirname "$MANIFEST")" "$CURSOR_DIR" "$CLAUDE_DIR"

# Clean up legacy format
if [[ -d ".claude/context" ]]; then
  echo "Removing legacy .claude/context/ directory..."
  rm -rf ".claude/context"
fi

COUNT=0
INSTALLED=()
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT
while IFS= read -r bp; do
  [[ -z "$bp" ]] && continue
  category="${bp%/*}"
  name="${bp#*/}"
  temp_cursor="${TEMP_DIR}/${category}_${name}.mdc"
  temp_claude="${TEMP_DIR}/${category}_${name}.md"
  if curl -fsSL "${BASE_URL}/api/blueprints/${category}/${name}?format=cursor" -o "$temp_cursor" 2>/dev/null && \
     curl -fsSL "${BASE_URL}/api/blueprints/${category}/${name}?format=claude" -o "$temp_claude" 2>/dev/null; then
    mkdir -p "${CURSOR_DIR}/${category}" "${CLAUDE_DIR}/${category}"
    mv "$temp_cursor" "${CURSOR_DIR}/${category}/${name}.mdc"
    mv "$temp_claude" "${CLAUDE_DIR}/${category}/${name}.md"
    INSTALLED+=("$bp")
    ((++COUNT))
  else
    echo "Warning: Blueprint not found: ${bp}"
  fi
done <<< "$BLUEPRINT_LIST"

if [[ -f "$MANIFEST" ]]; then
  REMOVED_CATEGORIES=()
  while IFS= read -r old_bp; do
    [[ -z "$old_bp" ]] && continue
    [[ " ${INSTALLED[*]+${INSTALLED[*]}} " =~ " ${old_bp} " ]] && continue
    category="${old_bp%/*}"
    name="${old_bp#*/}"
    rm -f "${CURSOR_DIR}/${category}/${name}.mdc" "${CLAUDE_DIR}/${category}/${name}.md"
    REMOVED_CATEGORIES+=("$category")
  done < "$MANIFEST"
  # Clean up empty category directories
  for category in $(printf '%s\n' "${REMOVED_CATEGORIES[@]+"${REMOVED_CATEGORIES[@]}"}" | sort -u); do
    [[ -d "${CURSOR_DIR}/${category}" ]] && [[ -z "$(ls -A "${CURSOR_DIR}/${category}" 2>/dev/null)" ]] && rmdir "${CURSOR_DIR}/${category}" 2>/dev/null || true
    [[ -d "${CLAUDE_DIR}/${category}" ]] && [[ -z "$(ls -A "${CLAUDE_DIR}/${category}" 2>/dev/null)" ]] && rmdir "${CLAUDE_DIR}/${category}" 2>/dev/null || true
  done
fi

printf '%s\n' ${INSTALLED[@]+"${INSTALLED[@]}"} > "$MANIFEST"
echo "Updated $COUNT blueprints"

# Send telemetry (fire and forget)
BLUEPRINTS_JSON="["
for i in "${!INSTALLED[@]}"; do
  [[ $i -gt 0 ]] && BLUEPRINTS_JSON+=","
  BLUEPRINTS_JSON+="\"${INSTALLED[$i]}\""
done
BLUEPRINTS_JSON+="]"

PROFILES_JSON="["
for i in "${!PROFILES[@]}"; do
  [[ $i -gt 0 ]] && PROFILES_JSON+=","
  PROFILES_JSON+="\"${PROFILES[$i]}\""
done
PROFILES_JSON+="]"

send_telemetry "$BLUEPRINTS_JSON" "$PROFILES_JSON"
