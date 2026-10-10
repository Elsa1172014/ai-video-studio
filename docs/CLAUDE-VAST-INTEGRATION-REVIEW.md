# Claude patch versus Vast.ai branch — integration decision

Reviewed user-supplied `platform-changes.patch` (89 paths) against current Vast.ai branch files.

## Decision
Use Claude's comprehensive application changes as the **primary platform baseline**, not the temporary `gpu-worker/` scaffold. Claude's patch contains `lib/server/gpu.ts`, `worker/main.py`, `worker/adapters/wan.py`, `worker/storage.py`, persistence, jobs, studios, and tests. Keep the Vast.ai branch's intent: explicitly select a secured HTTPS GPU worker without requiring RunPod.

## Verified limitations
- The Claude Wan adapter delegates to `WAN_GENERATE_COMMAND`; it does **not** install Wan model weights or implement an official Wan inference command.
- The Claude worker currently allows unauthenticated requests when `GPU_API_KEY` is unset (its `auth` function checks only if a key exists). Fail closed before public deployment.
- Claude's new `worker/fetch.py` appears to contain a defect: `fetch_media` writes to `out.open(...)` although `out` is not defined in the displayed function. Fix and test before adoption.
- `lib/server/gpu.ts` prioritizes RunPod if RunPod variables exist; change to explicit `GPU_PROVIDER=vast` selection.
- Neither the current Vast scaffold nor Claude's patch alone demonstrates a successful real GPU inference on Vast.ai.

## Safe sequence
1. Apply the supplied Claude patch to a fresh branch from the exact compatible base; never blindly overlay it onto this Vast branch.
2. Run `git apply --check` first; inspect conflicts and deleted files.
3. Fix worker auth and media fetch issues, run all tests, typecheck, and build.
4. Port Vast-specific provider selection and HTTPS validation to `lib/server/gpu.ts` (the Claude platform's active integration layer), not obsolete `lib/generation.ts`.
5. Implement and test Wan 2.2 inference separately; benchmark before paid rental.
6. Open a new PR; leave `main` and Production unchanged until review.

No live inference, GPU rental, or patch merge is claimed here.

## Audit correction (2026-10-10)

Direct inspection of the supplied 89-file patch confirms `worker/fetch.py` **does define** `out` before opening it; the earlier undefined-variable finding was incorrect. The security finding remains: `worker/main.py` accepts unauthenticated requests when `GPU_API_KEY` is unset. The patch includes 54 new files; a local syntax check passed for the one fully new Python file, but full application, typechecking, tests and GPU inference have not been completed. An independently verified `claude-vast-provider.patch` changes the Claude platform's actual `lib/server/gpu.ts` to explicitly select Vast.ai and require HTTPS for its worker URL. Apply only after the complete Claude patch, then test.
