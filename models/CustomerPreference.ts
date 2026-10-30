import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    customer_id: { type: Number, required: true, unique: true },
    dietary_preferences: [String],
    preferred_cuisines: [String],
    spice_level: {
      type: String,
      enum: ["Mild", "Medium", "High"],
      default: "Medium",
    },
    allergens: [String],
  },
  { autoCreate: false, autoIndex: false, collection: "customer_preferences" },
);
export const CustomerPreference =
  mongoose.models.CustomerPreference ||
  mongoose.model("CustomerPreference", schema);
