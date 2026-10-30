// Run with mongosh using an authenticated URI from .env, against restaurant_management_nosql.
// Application schemas are in models/; setup invokes Model.init() for these indexes.
db.reviews.createIndex({order_id:1},{unique:true});
db.reviews.createIndex({customer_id:1});
db.reviews.createIndex({'items_reviewed.item_id':1});
db.order_customizations.createIndex({order_item_id:1},{unique:true});
db.order_customizations.createIndex({order_id:1});
db.customer_preferences.createIndex({customer_id:1},{unique:true});
