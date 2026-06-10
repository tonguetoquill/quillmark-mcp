#!/usr/bin/env bash
# Fleet wrapper around the single-model runner: invokes `run.js --model <name>`
# once per model in config.json. Fan-out and parallelism live here so run.js
# stays strictly single-model; each model writes its own results file and the
# cross-model matrix is reconstructed afterwards from the results dir.
set -eo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$HERE/run.js"
CONFIG="$HERE/config.json"
[ -f "$CONFIG" ] || CONFIG="$HERE/config.example.json"

JOBS=1
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -j|--jobs) JOBS="$2"; shift 2 ;;
    --jobs=*) JOBS="${1#*=}"; shift ;;
    -h|--help)
      cat <<EOF
Usage: eval/run-all.sh [-j N] [run.js flags...]

Runs \`node eval/run.js --model <name>\` for every model in $(basename "$CONFIG"),
forwarding any extra flags (e.g. --trials 5, --preflight-only) to each run.

  -j, --jobs N   Models to run in parallel [default: 1, i.e. sequential]

Each model writes its own eval/results/<timestamp>__<model>.jsonl.
Aggregate the whole fleet afterwards:
  node eval/report.js eval/results/*.jsonl
EOF
      exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

mapfile -t MODELS < <(node -e 'const c=require(process.argv[1]); for (const m of (c.models||[])) console.log(m.name)' "$CONFIG")
[ "${#MODELS[@]}" -gt 0 ] || { echo "[run-all] no models in $CONFIG" >&2; exit 1; }

echo "[run-all] ${#MODELS[@]} model(s), jobs=$JOBS, flags: ${ARGS[*]:-(none)}" >&2

rc=0
run_one() {
  local name="$1"; shift
  echo "[run-all] >>> $name" >&2
  if ! node "$RUN" --model "$name" "$@"; then
    echo "[run-all] !!! $name failed" >&2
    return 1
  fi
}

if [ "$JOBS" -le 1 ]; then
  for name in "${MODELS[@]}"; do
    run_one "$name" "${ARGS[@]}" || rc=1
  done
else
  pids=()
  for name in "${MODELS[@]}"; do
    run_one "$name" "${ARGS[@]}" &
    pids+=("$!")
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n; done
  done
  for p in "${pids[@]}"; do wait "$p" || rc=1; done
fi

echo "[run-all] done. aggregate: node eval/report.js eval/results/*.jsonl" >&2
exit "$rc"
