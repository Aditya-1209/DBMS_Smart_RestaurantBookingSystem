import mongoose from "mongoose";
mongoose.set("bufferCommands", false);
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);
const g = globalThis as unknown as { mongo?: Promise<typeof mongoose> };
export async function mongodb() {
  if (!process.env.MONGODB_URI)
    throw Error("MONGODB_URI is missing. Run npm run setup:local.");
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!g.mongo)
    g.mongo = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 2500,
        maxPoolSize: 10,
      })
      .finally(() => {
        g.mongo = undefined;
      });
  return g.mongo;
}
