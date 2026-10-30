-- The reference submission's inserts are preserved in original-submission.sql.
-- Enhanced executable seeding is prisma/seed.ts, invoked by npm run db:seed.
-- It generates random local demo passwords and hashes them using scrypt; SQL plaintext
-- INSERT passwords are deliberately not executed. Run this assertion after seeding:
SELECT o.order_id,o.total_amount, SUM(oi.subtotal) AS verified_line_total
FROM orders o JOIN order_item oi USING(order_id)
WHERE o.idempotency_key='seed-order-0'
GROUP BY o.order_id;
-- Both totals must equal 880.00.
