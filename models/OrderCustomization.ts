import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    order_id: { type: Number, required: true, index: true },
    order_item_id: { type: Number, required: true, unique: true },
    item_id: { type: Number, required: true },
    customizations: {
      size: String,
      remove: [String],
      add: [String],
      special_instruction: String,
    },
  },
  { autoCreate: false, autoIndex: false, collection: "order_customizations" },
);
export const OrderCustomization =
  mongoose.models.OrderCustomization ||
  mongoose.model("OrderCustomization", schema);
