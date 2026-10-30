import "dotenv/config";
import { reconcile } from "../lib/services/orders";
import { prisma } from "../lib/prisma";
import mongoose from "mongoose";
reconcile()
  .then((ok) => {
    console.log(
      ok
        ? "All pending customization documents synchronized."
        : "MongoDB unavailable; pending instructions remain safely queued in PostgreSQL.",
    );
    if (!ok) process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
