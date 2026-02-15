#!/bin/bash
# Test harness for statusline.sh
# Runs the statusline script against mock JSON payloads and validates output.
#
# Usage: ./scripts/statusline-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATUSLINE="$SCRIPT_DIR/statusline.sh"
PASS=0
FAIL=0
TOTAL=0

# Colors for test output
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
RESET='\033[0m'

run_test() {
  local name="$1"
  local json="$2"
  local expected_pattern="$3"
  local should_not_match="${4:-}"
  TOTAL=$((TOTAL + 1))

  output=$(echo "$json" | "$STATUSLINE" 2>&1)
  # Strip ANSI codes for pattern matching
  clean=$(echo "$output" | sed 's/\x1b\[[0-9;]*m//g')

  local passed=true

  if ! echo "$clean" | grep -qE "$expected_pattern"; then
    passed=false
  fi

  if [ -n "$should_not_match" ] && echo "$clean" | grep -qE "$should_not_match"; then
    passed=false
  fi

  if $passed; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${RESET} $name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${RESET} $name"
    echo "    Expected pattern: $expected_pattern"
    if [ -n "$should_not_match" ]; then
      echo "    Should NOT match: $should_not_match"
    fi
    echo "    Got (raw): $clean"
  fi
}

run_perf_test() {
  local name="$1"
  local json="$2"
  local max_ms="$3"
  TOTAL=$((TOTAL + 1))

  local start_ns end_ns elapsed_ms
  start_ns=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
  echo "$json" | "$STATUSLINE" > /dev/null 2>&1
  end_ns=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
  elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))

  if [ "$elapsed_ms" -le "$max_ms" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${RESET} $name (${elapsed_ms}ms <= ${max_ms}ms)"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${RESET} $name (${elapsed_ms}ms > ${max_ms}ms)"
  fi
}

run_ansi_test() {
  local name="$1"
  local json="$2"
  TOTAL=$((TOTAL + 1))

  output=$(echo "$json" | "$STATUSLINE" 2>&1)

  # Count opening escape codes (non-reset) vs reset codes
  opens=$(echo "$output" | grep -oE '\x1b\[[0-9;]+m' | grep -v '\[0m' | wc -l | tr -d ' ')
  resets=$(echo "$output" | grep -oE '\x1b\[0m' | wc -l | tr -d ' ')

  if [ "$opens" -le "$resets" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${RESET} $name (${opens} opens, ${resets} resets)"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${RESET} $name (${opens} opens but only ${resets} resets — possible color leak)"
  fi
}

# ---------- Mock JSON payloads ----------

FULL_JSON='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 1.23, "total_duration_ms": 492000, "total_api_duration_ms": 12000, "total_lines_added": 156, "total_lines_removed": 23},
  "context_window": {"total_input_tokens": 84000, "total_output_tokens": 4521, "context_window_size": 200000, "used_percentage": 42, "remaining_percentage": 58},
  "session_id": "abc123", "version": "1.0.80"
}'

EARLY_SESSION='{
  "model": {"id": "claude-sonnet-4-5-20250929", "display_name": "Sonnet"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": null, "total_duration_ms": null, "total_lines_added": null, "total_lines_removed": null},
  "context_window": {"used_percentage": null, "remaining_percentage": null, "current_usage": null},
  "session_id": "def456", "version": "1.0.80"
}'

HIGH_CONTEXT='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/tmp/no-git-here", "project_dir": "/tmp/no-git-here"},
  "cost": {"total_cost_usd": 5.67, "total_duration_ms": 1800000, "total_lines_added": 0, "total_lines_removed": 0},
  "context_window": {"used_percentage": 78, "remaining_percentage": 22},
  "session_id": "ghi789", "version": "1.0.80"
}'

CRITICAL_CONTEXT='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 12.34, "total_duration_ms": 3600000, "total_lines_added": 500, "total_lines_removed": 200},
  "context_window": {"used_percentage": 95, "remaining_percentage": 5},
  "session_id": "jkl012", "version": "1.0.80"
}'

ZERO_CONTEXT='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 0, "total_duration_ms": 0, "total_lines_added": 0, "total_lines_removed": 0},
  "context_window": {"used_percentage": 0, "remaining_percentage": 100},
  "session_id": "mno345", "version": "1.0.80"
}'

FULL_CONTEXT='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 25.00, "total_duration_ms": 7200000, "total_lines_added": 1000, "total_lines_removed": 500},
  "context_window": {"used_percentage": 100, "remaining_percentage": 0},
  "session_id": "pqr678", "version": "1.0.80"
}'

DECIMAL_PCT='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 0.50, "total_duration_ms": 120000, "total_lines_added": 10, "total_lines_removed": 3},
  "context_window": {"used_percentage": 42.7, "remaining_percentage": 57.3},
  "session_id": "stu901", "version": "1.0.80"
}'

MINIMAL_JSON='{
  "model": {"display_name": "Opus"},
  "workspace": {"current_dir": "/tmp"}
}'

SONNET_MODEL='{
  "model": {"id": "claude-sonnet-4-5-20250929", "display_name": "Sonnet"},
  "workspace": {"current_dir": "/Users/shyam/www/reels_new", "project_dir": "/Users/shyam/www/reels_new"},
  "cost": {"total_cost_usd": 0.08, "total_duration_ms": 60000, "total_lines_added": 20, "total_lines_removed": 5},
  "context_window": {"used_percentage": 12, "remaining_percentage": 88},
  "session_id": "vwx234", "version": "1.0.80"
}'

HIGH_COST='{
  "model": {"id": "claude-opus-4-6", "display_name": "Opus"},
  "workspace": {"current_dir": "/Users/shyam/www/claude-wormhole", "project_dir": "/Users/shyam/www/claude-wormhole"},
  "cost": {"total_cost_usd": 123.45, "total_duration_ms": 18000000, "total_lines_added": 2000, "total_lines_removed": 800},
  "context_window": {"used_percentage": 65, "remaining_percentage": 35},
  "session_id": "yza567", "version": "1.0.80"
}'

# ---------- Run tests ----------

echo ""
echo "=== Statusline Test Suite ==="
echo ""

echo "--- T1: Field Extraction ---"
run_test "Normal session shows model" "$FULL_JSON" "\\[Opus\\]"
run_test "Normal session shows project dir" "$FULL_JSON" "claude-wormhole"
run_test "Normal session shows cost" "$FULL_JSON" '[$]1\.23'
run_test "Normal session shows percentage" "$FULL_JSON" "42%"
run_test "Normal session shows duration" "$FULL_JSON" "8m 12s"
run_test "Normal session shows lines changed" "$FULL_JSON" "\\+156.*-23"
run_test "Sonnet model shows correctly" "$SONNET_MODEL" "\\[Sonnet\\]"
run_test "Different project dir" "$SONNET_MODEL" "reels_new"

echo ""
echo "--- T2: Null/Missing Field Handling ---"
run_test "Early session no crash" "$EARLY_SESSION" "\\[Sonnet\\]"
run_test "Early session shows 0%" "$EARLY_SESSION" "0%"
run_test "Early session shows \$0.00" "$EARLY_SESSION" '[$]0\.00'
run_test "Minimal JSON no crash" "$MINIMAL_JSON" "\\[Opus\\]"
run_test "Decimal percentage truncated" "$DECIMAL_PCT" "42%"

echo ""
echo "--- T3: Context Bar Thresholds ---"
run_test "Zero context all empty" "$ZERO_CONTEXT" "░░░░░░░░░░"
run_test "Normal context has mix" "$FULL_JSON" "█.*░"
run_test "Full context all filled" "$FULL_CONTEXT" "██████████"
# We can't easily test ANSI colors in pattern, but we test the % values
run_test "High context shows 78%" "$HIGH_CONTEXT" "78%"
run_test "Critical context shows 95%" "$CRITICAL_CONTEXT" "95%"
run_test "No lines shown when zero" "$ZERO_CONTEXT" "0%" "\\+0.*-0"

echo ""
echo "--- T4: Edge Cases ---"
run_test "High cost formats correctly" "$HIGH_COST" '[$]123\.45'
run_test "Long duration formats" "$HIGH_COST" "300m 0s"
run_test "No git dir graceful" "$HIGH_CONTEXT" "no-git-here"

echo ""
echo "--- T5: ANSI Color Balance ---"
run_ansi_test "Normal session colors balanced" "$FULL_JSON"
run_ansi_test "Early session colors balanced" "$EARLY_SESSION"
run_ansi_test "Critical session colors balanced" "$CRITICAL_CONTEXT"

echo ""
echo "--- T6: Performance ---"
# Clear cache before cold test
rm -f /tmp/statusline-git-* 2>/dev/null
run_perf_test "Cold run (git + jq)" "$FULL_JSON" 500
run_perf_test "Warm run (cached git)" "$FULL_JSON" 300

echo ""
echo "================================"
echo -e "Results: ${GREEN}${PASS} passed${RESET}, ${RED}${FAIL} failed${RESET} out of ${TOTAL} tests"
echo "================================"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
