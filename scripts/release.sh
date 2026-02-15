#!/usr/bin/env bash
set -euo pipefail

# release.sh — Bump version, update changelog, commit, tag, push.
# Usage: ./scripts/release.sh [patch|minor|major] [--dry-run]

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
CHANGELOG="$REPO_ROOT/CHANGELOG.md"

DRY_RUN=false
FORCE_BUMP=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    patch|minor|major) FORCE_BUMP="$arg" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# --- Preflight checks ---

if ! $DRY_RUN; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: Working tree is not clean. Commit or stash changes first."
    exit 1
  fi
fi

CURRENT_VERSION=$(grep '"version"' "$PACKAGE_JSON" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# --- Determine last tag ---

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  COMMIT_RANGE="HEAD"
  echo "No previous tag found. Including all commits."
else
  COMMIT_RANGE="${LAST_TAG}..HEAD"
  echo "Last tag: $LAST_TAG"
fi

# --- Collect commits ---

COMMITS=$(git log "$COMMIT_RANGE" --pretty=format:"%s" 2>/dev/null || true)

if [ -z "$COMMITS" ]; then
  echo "No new commits since last tag. Nothing to release."
  exit 0
fi

# --- Determine bump type from commits ---

has_breaking=false
has_feat=false

while IFS= read -r msg; do
  if echo "$msg" | grep -qiE "^[a-z]+(\(.+\))?!:|BREAKING CHANGE"; then
    has_breaking=true
  fi
  if echo "$msg" | grep -qiE "^feat(\(.+\))?:"; then
    has_feat=true
  fi
done <<< "$COMMITS"

if [ -n "$FORCE_BUMP" ]; then
  BUMP="$FORCE_BUMP"
elif $has_breaking; then
  BUMP="major"
elif $has_feat; then
  BUMP="minor"
else
  BUMP="patch"
fi

# --- Calculate new version ---

IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"

case "$BUMP" in
  major) V_MAJOR=$((V_MAJOR + 1)); V_MINOR=0; V_PATCH=0 ;;
  minor) V_MINOR=$((V_MINOR + 1)); V_PATCH=0 ;;
  patch) V_PATCH=$((V_PATCH + 1)) ;;
esac

NEW_VERSION="${V_MAJOR}.${V_MINOR}.${V_PATCH}"
echo "Bump: $BUMP → v$NEW_VERSION"

# --- Build changelog entry ---

FEATURES=""
FIXES=""
PERFORMANCE=""
REFACTORING=""
BREAKING=""
OTHER=""

while IFS= read -r msg; do
  # Strip conventional commit prefix for display
  clean=$(echo "$msg" | sed 's/^[a-z]*\(([^)]*)\)\?!*: *//')

  if echo "$msg" | grep -qiE "^[a-z]+(\(.+\))?!:|BREAKING CHANGE"; then
    BREAKING="${BREAKING}- ${clean}\n"
  fi

  if echo "$msg" | grep -qiE "^feat(\(.+\))?:"; then
    FEATURES="${FEATURES}- ${clean}\n"
  elif echo "$msg" | grep -qiE "^fix(\(.+\))?:"; then
    FIXES="${FIXES}- ${clean}\n"
  elif echo "$msg" | grep -qiE "^perf(\(.+\))?:"; then
    PERFORMANCE="${PERFORMANCE}- ${clean}\n"
  elif echo "$msg" | grep -qiE "^refactor(\(.+\))?:"; then
    REFACTORING="${REFACTORING}- ${clean}\n"
  else
    # Non-conventional or other types (docs, chore, ci, etc.)
    if ! echo "$msg" | grep -qiE "^[a-z]+(\(.+\))?!:"; then
      OTHER="${OTHER}- ${clean}\n"
    fi
  fi
done <<< "$COMMITS"

DATE=$(date +%Y-%m-%d)
ENTRY="## [${NEW_VERSION}] - ${DATE}\n"

[ -n "$BREAKING" ]    && ENTRY="${ENTRY}\n### Breaking Changes\n\n${BREAKING}"
[ -n "$FEATURES" ]    && ENTRY="${ENTRY}\n### Features\n\n${FEATURES}"
[ -n "$FIXES" ]       && ENTRY="${ENTRY}\n### Bug Fixes\n\n${FIXES}"
[ -n "$PERFORMANCE" ] && ENTRY="${ENTRY}\n### Performance\n\n${PERFORMANCE}"
[ -n "$REFACTORING" ] && ENTRY="${ENTRY}\n### Refactoring\n\n${REFACTORING}"
[ -n "$OTHER" ]       && ENTRY="${ENTRY}\n### Other\n\n${OTHER}"

# --- Dry run output ---

if $DRY_RUN; then
  echo ""
  echo "=== DRY RUN ==="
  echo "Would bump: $CURRENT_VERSION → $NEW_VERSION ($BUMP)"
  echo ""
  echo "Changelog entry:"
  echo "---"
  echo -e "$ENTRY"
  echo "---"
  echo ""
  echo "Actions that would be taken:"
  echo "  1. Update package.json version to $NEW_VERSION"
  echo "  2. Update CHANGELOG.md"
  echo "  3. git commit -m 'chore(release): v$NEW_VERSION'"
  echo "  4. git tag v$NEW_VERSION"
  echo "  5. git push origin main --tags"
  exit 0
fi

# --- Apply changes ---

# Update package.json version
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" "$PACKAGE_JSON"

# Update or create CHANGELOG.md
if [ -f "$CHANGELOG" ]; then
  # Insert new entry after the header line
  TEMP=$(mktemp)
  awk -v entry="$(echo -e "$ENTRY")" '
    /^# Changelog/ { print; print ""; print entry; found=1; next }
    { print }
  ' "$CHANGELOG" > "$TEMP"
  mv "$TEMP" "$CHANGELOG"
else
  echo -e "# Changelog\n\n${ENTRY}" > "$CHANGELOG"
fi

# Commit, tag, push
cd "$REPO_ROOT"
git add package.json CHANGELOG.md
git commit -m "chore(release): v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin main --tags

echo ""
echo "Released v${NEW_VERSION}"
