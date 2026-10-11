-- consensusclub on Tiger Data (TimescaleDB). Idempotent: the server runs this on every start.
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

-- The gameplay timeline: every message a player sends and every phase and headline the table sees,
-- in order. A hypertable on time (room_code, not match_id, ties events before a match id exists).
CREATE TABLE IF NOT EXISTS cc_events (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  at         timestamptz NOT NULL,
  room_code  text        NOT NULL,
  match_id   uuid,
  round      integer,
  phase      text,
  kind       text        NOT NULL,
  seat       integer,
  persona    text,
  bot        boolean,
  payload    jsonb,
  PRIMARY KEY (id, at)
);
SELECT create_hypertable('cc_events', by_range('at', INTERVAL '1 day'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS cc_events_match ON cc_events (match_id, at);
CREATE INDEX IF NOT EXISTS cc_events_room ON cc_events (room_code, at DESC);
CREATE INDEX IF NOT EXISTS cc_events_kind ON cc_events (kind, at DESC);

-- One flat summary row per match, for fast lists and filters without reading the whole record.
CREATE TABLE IF NOT EXISTS cc_match_summaries (
  match_id          uuid        PRIMARY KEY,
  room_code         text        NOT NULL,
  session_kind      text        NOT NULL,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz,
  completed         boolean     NOT NULL,
  rounds            integer     NOT NULL,
  players           jsonb       NOT NULL,
  winners           jsonb,
  scores            jsonb,
  viable            boolean,
  proposals         integer     NOT NULL,
  approved          integer     NOT NULL,
  stopped           integer     NOT NULL,
  twists            integer     NOT NULL,
  combos            integer     NOT NULL,
  responses         integer     NOT NULL,
  indicators_start  jsonb,
  indicators_end    jsonb,
  stories           jsonb       NOT NULL,
  scenario_source   text,
  headlines         jsonb       NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_match_summaries_started ON cc_match_summaries (started_at DESC);
CREATE INDEX IF NOT EXISTS cc_match_summaries_session ON cc_match_summaries (session_kind, started_at DESC);

-- The city after each round of each match; the row flagged final is the finished plan.
CREATE TABLE IF NOT EXISTS cc_city_snapshots (
  match_id   uuid        NOT NULL,
  round      integer     NOT NULL,
  at         timestamptz NOT NULL,
  final      boolean     NOT NULL DEFAULT false,
  indicators jsonb       NOT NULL,
  built      jsonb       NOT NULL,
  PRIMARY KEY (match_id, round)
);
CREATE INDEX IF NOT EXISTS cc_city_snapshots_final ON cc_city_snapshots (final, at DESC);

-- Civic Atlas's computed summaries and planner briefs, saved as they are produced.
CREATE TABLE IF NOT EXISTS cc_studio_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  session_kind  text        NOT NULL,
  matches       integer     NOT NULL,
  responses     integer     NOT NULL,
  summary       jsonb       NOT NULL,
  brief         text,
  brief_source  text
);
CREATE INDEX IF NOT EXISTS cc_studio_snapshots_at ON cc_studio_snapshots (session_kind, created_at DESC);

-- The public civic record on Solana: a fingerprint per match, its memo and Merkle proof, and the batches.
CREATE TABLE IF NOT EXISTS cc_civic_matches (
  match_id    uuid        PRIMARY KEY,
  anchor_id   uuid,
  fingerprint text        NOT NULL,
  proof       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_civic_matches_waiting ON cc_civic_matches (updated_at) WHERE anchor_id IS NULL;
CREATE TABLE IF NOT EXISTS cc_civic_anchors (
  id          uuid        PRIMARY KEY,
  created_at  timestamptz NOT NULL,
  anchor      jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_civic_anchors_at ON cc_civic_anchors (created_at DESC);
