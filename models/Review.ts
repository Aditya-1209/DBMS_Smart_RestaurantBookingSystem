import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    customer_id: { type: Number, required: true, index: true },
    order_id: { type: Number, required: true, unique: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 2000, required: true },
    items_reviewed: [
      {
        _id: false,
        item_id: { type: Number, required: true },
        rating: { type: Number, min: 1, max: 5, required: true },
      },
    ],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { autoCreate: false, autoIndex: false, collection: "reviews" },
);
schema.index({ "items_reviewed.item_id": 1 });
export const Review =
  mongoose.models.Review || mongoose.model("Review", schema);
