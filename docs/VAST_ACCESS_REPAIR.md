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
