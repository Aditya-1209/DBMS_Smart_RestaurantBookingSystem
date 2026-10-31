ALTER TABLE reservation ADD COLUMN checked_in_at TIMESTAMPTZ;
-- Preserve already-seated reservations from the previous manual occupancy workflow.
UPDATE reservation r SET checked_in_at=CURRENT_TIMESTAMP FROM restaurant_table t
WHERE r.table_id=t.table_id AND t.status='Occupied' AND r.status='Confirmed'
AND r.starts_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
AND r.ends_at > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
