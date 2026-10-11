# Vast access repair — 11 October 2026

The stopped A40 instance 55356791 was originally launched in legacy Jupyter+SSH mode with `entrypoint.sh` as on-start. Its official base image also starts an Instance Portal and a proxied Jupyter service. The legacy Jupyter gateway returned 504; the console Open destination returned 502, `The remote server does not speak TLS`. Rebooting did not establish access. The original environment does not contain `ENABLE_HTTPS`.

Reviewed official Vast documentation:
- https://docs.vast.ai/guides/instances/connect/instance-portal
- https://github.com/vast-ai/base-image/

Prepared and saved the private template **AI Video Studio Preview — HTTPS repair**. This is a candidate repair, not a verified working deployment:

```text
Image: vastai/pytorch:@vastai-automatic-tag
Launch mode: Docker ENTRYPOINT
On-start: empty (use the image's official entrypoint)
Container disk: 120 GB
Docker options:
-p 1111:1111 -p 8080:8080 -e OPEN_BUTTON_PORT="1111" -e JUPYTER_DIR="/workspace/" -e DATA_DIRECTORY="/workspace/" -e ENABLE_HTTPS="true" -e ENABLE_AUTH="true" -e PORTAL_CONFIG="localhost:1111:11111:/:Instance Portal|localhost:8080:18080:/:Jupyter"
```

This preserves portal authentication, enables TLS on the exposed proxy ports, removes unused exposed applications, and avoids the legacy Jupyter launcher. Do not disable authentication or certificate verification. Direct HTTPS uses Vast certificates and may require a user-managed certificate trust step; a functioning official secure tunnel is preferred.

The console says recreating an instance is irreversible and loses all container data. Do not apply a recreate operation without explicit action-time approval and verifying that the selected template is the repaired template. The existing container still references the old template; saving a template does not fix that container by itself. No new GPU rental, Wan install, inference or Production merge is implied by saving this template.

## Applied repair and next diagnostic

After explicit action-time approval, recreated instance 55356791 with the named HTTPS repair template. Verified its environment now contains `ENABLE_HTTPS=true`, `ENABLE_AUTH=true`, and the reduced portal configuration. The saved template selects Docker ENTRYPOINT; the instance status string still includes `/jupyter`, so a change of the platform's underlying launch mode is not established by the template name alone.

The direct Open destination changed from a TLS protocol error to `Certificate verify failed: unable to get local issuer certificate`. The cloud browser's connection cannot trust the Vast certificate. Did not bypass certificate verification. Retested the console's Jupyter terminal proxy after this change; it rendered 504 Gateway Time-out. No usable terminal, model installation or inference was established. The instance-scoped public key 1539128 remained registered after recreation; the displayed proxy SSH target remained `root@ssh8.vast.ai:15903`.

Prepared `.github/workflows/vast-access-check.yml` as a bounded, read-only SSH/CUDA/service-listener diagnostic on the feature branch. It performs no package installation, inference, GPU rental or Production deployment, and skips remote access while `VAST_PREVIEW_SSH_PRIVATE_KEY` is absent. It uses the existing dedicated instance-only key, not an account key. Uploading that private key to GitHub Actions is a new credential destination and requires separate explicit action-time approval. Do not upload or trigger remote access without it. Local YAML/Bash validation is not a successful remote SSH test.

Stopped GPU after the failed browser checks. Verified Exited / Intended Stopped, Inactive / Start, and USD 0.034/hour disk-only pricing; latest observed credit USD 4.76. Storage remains billable at about USD 0.80/day. No additional payment, new rental, Wan weights, video inference or Production merge occurred.
