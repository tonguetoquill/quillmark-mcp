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

JOBS=4
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

  -j, --jobs N   Models to run in parallel [default: 4; pass 1 for sequential]

Each model writes its own eval/results/<timestamp>__<model>.jsonl.
Aggregate the whole fleet afterwards:
  node eval/report.js eval/results/*.jsonl
EOF
      exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

mapfile -t MODELS < <(node "$RUN" --list-models)
[ "${#MODELS[@]}" -gt 0 ] || { echo "[run-all] no models found (node $RUN --list-models)" >&2; exit 1; }

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
    # `|| true`: a finished model's non-zero exit must not trip `set -e` and
    # abort the whole sweep — per-model failures are captured by the final
    # reap loop (`wait "$p" || rc=1`). Without this, one bad run kills the rest.
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n || true; done
  done
  for p in "${pids[@]}"; do wait "$p" || rc=1; done
fi

echo "[run-all] done. aggregate: node eval/report.js eval/results/*.jsonl" >&2
exit "$rc"
