# Security Model

Reference for the security hardening measures applied to Quillmark MCP across the container, network, application, and runtime layers.

## Threat Model Summary

Quillmark MCP accepts untrusted input (document content from LLM agents) and executes untrusted code (Quill format definitions run in WASM). The security model assumes both the input and the Quill definitions are adversarial and applies defense-in-depth accordingly.

## Container Security

The Docker image and compose stack enforce the principle of least privilege at every layer.

| Measure | Implementation | Protects Against |
|---|---|---|
| **Non-root user** | UID `10001` (user `quill`), set via `USER quill:quill` in Dockerfile and `user: "10001:10001"` in compose | Privilege escalation from container breakout; prevents writing to system paths |
| **Read-only root filesystem** | `read_only: true` in compose | Persistent malware, config tampering, post-exploitation persistence |
| **tmpfs /tmp** | `tmpfs: [/tmp]` in compose | Provides a writable scratch area without compromising rootfs read-only guarantee |
| **Drop all capabilities** | `cap_drop: [ALL]` in compose | Blocks `CAP_NET_RAW`, `CAP_SYS_ADMIN`, `CAP_CHOWN`, and all other Linux capabilities; prevents network sniffing, mount manipulation, device access |
| **No new privileges** | `security_opt: [no-new-privileges:true]` in compose | Prevents `setuid`/`setgid` binaries and `execve` privilege escalation inside the container |
| **PID limit** | `pids_limit: 256` in compose | Fork bombs; runaway process spawning from WASM or Node.js child processes |
| **Memory limit** | `mem_limit: 512m` in compose | Memory exhaustion DoS; prevents a single container from starving the host |
| **CPU limit** | `cpus: 1.0` in compose | CPU exhaustion DoS; bounds compute available to rendering workloads |
| **tini as PID 1** | `ENTRYPOINT ["/usr/bin/tini", "--", "node", "src/bin.js"]` in Dockerfile | Proper signal forwarding (`SIGTERM`, `SIGINT`), zombie process reaping; Node.js does not handle orphaned children correctly as PID 1 |

## Docker Image

| Measure | Implementation | Protects Against |
|---|---|---|
| **Slim base (not Alpine)** | `node:24-slim` (Debian-based) | Alpine uses musl libc, which is incompatible with some WASM toolchains and native Node.js addons that require glibc. Slim provides glibc without the full Debian package set |
| **No curl/wget in final image** | Only `tini` is installed in the runtime stage; no HTTP clients | Prevents data exfiltration, reverse shell downloads, and supply-chain payload fetching from inside the container |
| **Multi-stage build** | Separate `deps`, `test`, and `runtime` stages | Test tooling, devDependencies, and build artifacts never ship in the production image |
| **npm ci --omit=dev** | Production deps only in the `deps` stage | Minimizes attack surface by excluding dev-only packages |
| **--ignore-scripts** | Used with `npm ci` in both stages | Prevents arbitrary script execution during package installation (supply-chain attacks via postinstall hooks) |

## Network Security

| Measure | Implementation | Protects Against |
|---|---|---|
| **Localhost-only binding** | `ports: ["127.0.0.1:8080:8080"]` in compose | Remote network access; the MCP server is only reachable from the host machine, per MCP spec guidance |
| **JSON 404 for unknown routes** | Returns `{"error":"not_found"}` for unmatched paths | Helps OAuth-probing MCP clients parse the body and fall through gracefully instead of crashing on HTML 404 pages |
| **No outbound network required** | All quill definitions are bundled locally in `/app/quills` | No runtime dependency on external registries or CDNs; air-gapped operation is supported |

## Authentication

| Measure | Implementation | Protects Against |
|---|---|---|
| **Optional Bearer token** | `--auth-token` flag or `httpStream.authToken` config; checked on every HTTP request before MCP dispatch | Unauthorized tool invocation from other processes on the host; accidental exposure if port binding is misconfigured |
| **Early rejection** | Token mismatch returns `401 Unauthorized` before any tool logic executes | Prevents resource consumption from unauthenticated requests |

Auth is optional because the default deployment binds to `127.0.0.1` only, where same-host trust is reasonable. Enable it when exposing the server beyond localhost or in multi-tenant environments.

## Artifact Serving (Path Traversal Protection)

The `serveFile()` function in `McpSdkServerAdapter` serves rendered artifacts (PDFs, SVGs) over HTTP. Two layers of defense prevent directory traversal:

### Layer 1: Character rejection

```
if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..'))
```

Any filename containing `/`, `\`, or `..` is immediately rejected with HTTP `400 Bad Request`. This blocks the obvious traversal payloads (`../../etc/passwd`, `..\windows\system32`).

### Layer 2: Resolved path containment

```
const filePath = path.join(artifactsDir, fileName);
if (!filePath.startsWith(artifactsDir + path.sep))
```

After joining, the resolved path must start with `artifactsDir + path.sep`. This catches edge cases where `path.join` normalization could escape the directory (e.g., null bytes, Unicode normalization tricks). If the check fails, the response is HTTP `403 Forbidden`.

| Attack Vector | Blocked By |
|---|---|
| `../../etc/passwd` | Layer 1 (contains `/` and `..`) |
| `..\windows\system32\config` | Layer 1 (contains `\` and `..`) |
| URL-encoded traversal (`%2e%2e%2f`) | Layer 1 (Node.js `URL` parser decodes before reaching the check) |
| Symlink escape | Layer 2 (resolved path must stay within artifacts directory) |
| Empty filename | Layer 1 (`!fileName` guard) |

## WASM Isolation

Quill format definitions contain rendering logic that executes as WASM modules via `@quillmark/wasm`. WASM provides:

| Property | What It Means |
|---|---|
| **Memory sandbox** | WASM modules get a linear memory buffer with no access to Node.js heap, filesystem, or network |
| **No syscall access** | WASM cannot call `fs`, `net`, `child_process`, or any Node.js native modules |
| **Deterministic execution** | Same input always produces same output; no access to clocks, random, or environment |
| **Bounded resource use** | Memory growth is capped by the WASM runtime; combined with container `mem_limit` for belt-and-suspenders |

The WASM engine validates documents via `dryRun()` (schema + business rules) and renders via `render()`. Both paths execute untrusted Quill code in the sandbox. If a Quill definition is malicious or buggy, it can only crash its own WASM instance -- it cannot affect the host process, filesystem, or network.

## Signal Handling (tini)

Node.js has well-known issues when running as PID 1 in containers:

- Does not forward signals to child processes
- Does not reap zombie (defunct) processes
- `SIGTERM` from `docker stop` may not trigger graceful shutdown

`tini` runs as PID 1 and:

1. Forwards `SIGTERM` and `SIGINT` to the Node.js process for graceful shutdown
2. Reaps zombie child processes (relevant if WASM or rendering spawns subprocesses)
3. Exits with the correct status code so Docker health checks and orchestrators see the real exit state

## Security Checklist

Summary of all measures and what each protects against:

| Category | Measure | Threat Mitigated |
|---|---|---|
| Container | Non-root UID 10001 | Privilege escalation |
| Container | Read-only rootfs | Persistent compromise |
| Container | cap_drop ALL | Capability abuse |
| Container | no-new-privileges | setuid/setgid escalation |
| Container | pids_limit 256 | Fork bomb DoS |
| Container | mem_limit 512m | Memory exhaustion DoS |
| Container | tini as PID 1 | Signal handling, zombie reaping |
| Image | Slim (not Alpine) | glibc compatibility for WASM |
| Image | No curl/wget | Data exfiltration, reverse shells |
| Image | Multi-stage build | Dev tooling in production |
| Network | 127.0.0.1 binding | Remote access |
| Network | Optional Bearer auth | Unauthorized local access |
| Application | Path traversal guards | Directory traversal |
| Application | Resolved path containment | Symlink/normalization escapes |
| Runtime | WASM sandbox | Malicious quill code execution |
| Runtime | Structured error returns | Information leakage via stack traces |
