-- Two bookings of the same lab may not overlap. The application check alone is not enough:
-- two requests that arrive together can both pass it before either one writes (review finding R1).
-- Touching a range that ends exactly where another starts is still allowed: the range is [start, end).
-- If this fails, existing overlapping rows must be resolved first; the migration will not delete them.
create extension if not exists btree_gist;

alter table reservations
  add constraint reservations_no_overlap
  exclude using gist (lab_id with =, tstzrange(starts_at, ends_at) with &&);
