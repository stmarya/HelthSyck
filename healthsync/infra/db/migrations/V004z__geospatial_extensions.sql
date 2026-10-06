-- V005 uses ll_to_earth() in a pharmacy geospatial index.
-- Keep this additive so already-applied migration histories remain immutable.
BEGIN;
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
COMMIT;
