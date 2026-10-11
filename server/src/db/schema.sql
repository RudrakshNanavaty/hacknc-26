-- Coastal Clash on Tiger Data (TimescaleDB). Idempotent: the server runs this on every start.
-- Statements are split on a semicolon at the end of a line, so keep semicolons out of the middle.
-- Tables are prefixed cc_ so they can share a database with other projects.

-- One row per match: the whole planning-feedback record (rounds, rules, outcomes, responses).
CREATE TABLE IF NOT EXISTS cc_matches (
  id            uuid        PRIMARY KEY,
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  room_code     text        NOT NULL,
  session_kind  text        NOT NULL,
  rules_version text        NOT NULL,
  data_version  text        NOT NULL,
  record        jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_matches_started ON cc_matches (started_at DESC);

-- Every decision as a time series: plays, negotiation moves, outcomes and personal preferences,
-- with the district and its coordinates. Hypertable on time.
CREATE TABLE IF NOT EXISTS cc_decisions (
  id           text             NOT NULL,
  at           timestamptz      NOT NULL,
  match_id     uuid             NOT NULL,
  round        integer,
  kind         text             NOT NULL,
  seat         integer,
  persona      text,
  participant  text,
  session_kind text             NOT NULL,
  card         text,
  project      text,
  proposal_id  text,
  district     text,
  lon          double precision,
  lat          double precision,
  status       text,
  detail       jsonb,
  PRIMARY KEY (id, at)
);
SELECT create_hypertable('cc_decisions', by_range('at', INTERVAL '1 day'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS cc_decisions_district ON cc_decisions (district, at DESC);
CREATE INDEX IF NOT EXISTS cc_decisions_match ON cc_decisions (match_id);

-- Contested proposals per district per hour (real-time continuous aggregate for the studio).
CREATE MATERIALIZED VIEW IF NOT EXISTS cc_district_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 hour', at) AS bucket, district, session_kind,
  count(*) FILTER (WHERE kind = 'outcome') AS outcomes,
  count(*) FILTER (WHERE kind = 'outcome' AND status IN ('blocked', 'rejected', 'delayed')) AS stopped,
  count(*) FILTER (WHERE kind = 'preference') AS preferences
FROM cc_decisions
GROUP BY bucket, district, session_kind
WITH NO DATA;
SELECT add_continuous_aggregate_policy('cc_district_hourly',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE);
