# Provider result → OSS production pipeline

Generated results are publishable only as `/api/media-assets/<asset-id>`. A
provider URL, raw OSS URL, or signed OSS URL is never stored as generation
business data.

## Data flow

1. A generation processor receives a temporary provider URL and validates its
   HTTPS host, redirect policy, byte length, MIME type, and file signature.
2. `register_oss_mirror_transfer` encrypts the temporary URL and creates an
   idempotent Postgres transfer row. The API waits; only the dedicated mirror
   loop claims work with `FOR UPDATE SKIP LOCKED`.
3. `mirror` mode prefers OSS Website back-to-origin after proving the bucket is
   private. Any mirror failure falls back to the same bounded server stream used
   by `stream` mode. PUT uses private object ACL and forbid-overwrite.
4. The worker performs signed HEAD and a full signed GET. It verifies size,
   MIME, SHA-256, and magic bytes. Images also receive a full bounded Sharp
   decode plus pixel/edge checks.
5. The worker registers the object in `private.media_assets`, completes the
   upload fence, and verifies images/audio. Video remains `uploaded`; a trigger
   creates a durable `private.media_validation_jobs` row.
6. The validation loop streams the entire OSS object to a mode-0600 temporary
   file while recomputing SHA-256 and enforcing the byte ceiling. `ffprobe`
   validates the container, dimensions, and duration. One fenced RPC atomically
   marks the asset `verified` or `quarantined`.
7. Only after the asset is verified does `complete_oss_mirror_transfer` write
   `media_asset_id` in the same transaction and erase the provider capability.
   The generation then stores the canonical application URL.

Transient OSS/network/database failures are deferred with exponential delay.
Deterministic safety/container failures go to the durable DLQ. A stale worker
cannot settle because every processing RPC requires the lease token and
monotonic fence version.

## Worker isolation and shutdown

`scripts/worker.ts` supervises five independent bounded consumers:

- BullMQ generation Worker;
- generation Postgres outbox relay;
- OSS mirror/recovery loop;
- media validation/recovery loop;
- two-phase retention cleanup loop.

On SIGTERM/SIGINT, the shared stop fence prevents new relay/DB claims, BullMQ
drains active generation processors, leased media batches settle, and the
producer closes last. PM2 allows 45 seconds; application shutdown is limited to
30 seconds.

Cleanup uses `claim → authorize → OSS DELETE → confirm`; failures call `nack`
with a bounded delay. OSS DELETE treats 404 as idempotent success. Legal holds
and active references are checked by the database immediately before deletion.

## Required production configuration

- `IMAGE_STORAGE_PROVIDER=aliyun-oss`
- `ALIYUN_OSS_REMOTE_TRANSFER_MODE=stream|mirror` (`stream` recommended)
- a private `ALIYUN_OSS_BUCKET`
- explicit `ALIYUN_OSS_REMOTE_ALLOWED_HOSTS`
- `ALIYUN_OSS_MIRROR_SIGNING_SECRET` (at least 32 random characters)
- `ADMIN_SECRETS_ENCRYPTION_KEY` (32-byte hex)
- `GENERATION_QUEUE_MODE=bullmq` and standard `REDIS_URL`
- `ffprobe` installed on every Worker host

`npm run oss:configure-mirror -- --check` is read-only. Deployment fails before
traffic switches unless secrets have valid shape, ffprobe exists, the bucket is
private, and OSS is reachable. In `mirror` mode it additionally checks the exact
Website rule and resolver health.

## Operations and alerts

Emit and aggregate JSON events from the worker. Alert on:

- any mirror/validation/cleanup fatal supervisor event;
- stale processing leases > 0 for two health intervals;
- oldest pending age above 120 seconds;
- mirror failed or validation dead growth above baseline;
- uploaded video without validation job > 0;
- repeated cleanup deferrals or worker restarts;
- BullMQ waiting growth with zero active workers.

During an incident, do not expose provider URLs or make the bucket public. Fix
the dependency, run the service-role recovery RPCs, and let fenced consumers
reclaim. DLQ items require inspecting only redacted error codes and immutable
asset/transfer IDs; source capabilities are erased after terminal failure.
