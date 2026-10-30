// Examples for a mongosh session using the project database.
db.reviews.find({customer_id:1}).sort({created_at:-1});
db.reviews.find({'items_reviewed.item_id':1});
db.reviews.aggregate([{$unwind:'$items_reviewed'},{$group:{_id:'$items_reviewed.item_id',average_rating:{$avg:'$items_reviewed.rating'},review_count:{$sum:1}}}]);
db.order_customizations.find({order_id:1});
db.customer_preferences.findOne({customer_id:1});
