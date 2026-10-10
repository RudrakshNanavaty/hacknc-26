-- ReefForge on Tiger Data (TimescaleDB). Idempotent: the server runs this on every start.
-- Statements are split on a semicolon at the end of a line, so keep semicolons out of the middle.

-- Every evaluated design, solo or room, with everything needed to re-run it. Hypertable on time.
CREATE TABLE IF NOT EXISTS experiments (
  id              uuid             NOT NULL,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  reef            text             NOT NULL,
  room_code       text,
  player_id       text             NOT NULL,
  player_name     text             NOT NULL,
  material        integer          NOT NULL,
  settlement_rate double precision,
  model           text             NOT NULL,
  seed            bigint           NOT NULL,
  design          jsonb            NOT NULL,
  flow            jsonb,
  result          jsonb            NOT NULL,
  PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('experiments', by_range('created_at', INTERVAL '1 day'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS experiments_reef ON experiments (reef, created_at DESC);
CREATE INDEX IF NOT EXISTS experiments_player ON experiments (player_id, created_at DESC);

-- Experiments per reef per hour. Real-time (materialized_only = false): new experiments count at once.
CREATE MATERIALIZED VIEW IF NOT EXISTS reef_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 hour', created_at) AS bucket, reef,
  count(*) AS experiments, avg(material) AS avg_material, max(settlement_rate) AS best_settlement
FROM experiments
GROUP BY bucket, reef
WITH NO DATA;
SELECT add_continuous_aggregate_policy('reef_hourly',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE);
