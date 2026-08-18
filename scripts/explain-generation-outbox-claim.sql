\set ON_ERROR_STOP on
\if :{?rows}
\else
\set rows 1000000
\endif

-- Offline-only planner benchmark. This creates only a session-local TEMP table
-- and never reads or writes production queue rows. Run it on an isolated
-- Postgres instance because one million synthetic rows still consume I/O/CPU.
CREATE TEMP TABLE generation_job_outbox_bench (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

INSERT INTO generation_job_outbox_bench (
  id,
  user_id,
  status,
  available_at,
  lease_expires_at,
  attempts,
  max_attempts,
  created_at
)
SELECT
  (
    substr(md5('job-' || n::TEXT), 1, 8) || '-' ||
    substr(md5('job-' || n::TEXT), 9, 4) || '-' ||
    substr(md5('job-' || n::TEXT), 13, 4) || '-' ||
    substr(md5('job-' || n::TEXT), 17, 4) || '-' ||
    substr(md5('job-' || n::TEXT), 21, 12)
  )::UUID,
  CASE
    WHEN n % 10 < 7 THEN '00000000-0000-4000-8000-000000000001'::UUID
    ELSE (
      substr(md5('tenant-' || (n % 1000)::TEXT), 1, 8) || '-' ||
      substr(md5('tenant-' || (n % 1000)::TEXT), 9, 4) || '-' ||
      substr(md5('tenant-' || (n % 1000)::TEXT), 13, 4) || '-' ||
      substr(md5('tenant-' || (n % 1000)::TEXT), 17, 4) || '-' ||
      substr(md5('tenant-' || (n % 1000)::TEXT), 21, 12)
    )::UUID
  END,
  CASE WHEN n % 20 = 0 THEN 'publishing' ELSE 'pending' END,
  clock_timestamp() - make_interval(secs => (n % 86400)::INTEGER),
  CASE
    WHEN n % 20 = 0
      THEN clock_timestamp() - make_interval(secs => (n % 3600)::INTEGER)
    ELSE NULL
  END,
  n % 20,
  25,
  clock_timestamp() - make_interval(secs => (n % 604800)::INTEGER)
FROM generate_series(1, :rows) AS series(n);

CREATE INDEX generation_job_outbox_bench_pending_idx
  ON generation_job_outbox_bench (available_at, created_at, id)
  INCLUDE (user_id)
  WHERE status = 'pending' AND attempts < max_attempts;
CREATE INDEX generation_job_outbox_bench_expired_idx
  ON generation_job_outbox_bench (lease_expires_at, created_at, id)
  INCLUDE (user_id, available_at)
  WHERE status = 'publishing' AND attempts < max_attempts;
ANALYZE generation_job_outbox_bench;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
WITH params AS (
  SELECT clock_timestamp() AS now_at, 8000 AS candidate_limit, 500 AS claim_limit
),
pending_sample AS MATERIALIZED (
  SELECT o.id, o.user_id, o.available_at, o.created_at, o.available_at AS ready_at
  FROM generation_job_outbox_bench AS o CROSS JOIN params
  WHERE o.status = 'pending'
    AND o.attempts < o.max_attempts
    AND o.available_at <= params.now_at
  ORDER BY o.available_at, o.created_at, o.id
  LIMIT 8000
),
expired_lease_sample AS MATERIALIZED (
  SELECT o.id, o.user_id, o.available_at, o.created_at, o.lease_expires_at AS ready_at
  FROM generation_job_outbox_bench AS o CROSS JOIN params
  WHERE o.status = 'publishing'
    AND o.attempts < o.max_attempts
    AND o.lease_expires_at <= params.now_at
  ORDER BY o.lease_expires_at, o.created_at, o.id
  LIMIT 8000
),
bounded_ready AS MATERIALIZED (
  SELECT sampled.*
  FROM (
    SELECT pending.* FROM pending_sample AS pending
    UNION ALL
    SELECT expired.* FROM expired_lease_sample AS expired
  ) AS sampled
  ORDER BY sampled.ready_at, sampled.created_at, sampled.id
  LIMIT 8000
),
tenant_ranked AS MATERIALIZED (
  SELECT
    ready.*,
    row_number() OVER (
      PARTITION BY ready.user_id
      ORDER BY ready.ready_at, ready.created_at, ready.id
    ) AS tenant_rank
  FROM bounded_ready AS ready
)
SELECT ranked.id, ranked.user_id, ranked.tenant_rank
FROM tenant_ranked AS ranked
ORDER BY ranked.tenant_rank, ranked.ready_at, ranked.created_at, ranked.id
LIMIT 500;
