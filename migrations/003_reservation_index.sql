-- Speeds up the overlap check run before every booking or move.
create index reservations_lab_time_idx on reservations (lab_id, starts_at);
