import "dotenv/config";

import connectDB from "./db/index.js";
import { app } from "./app.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(`🚀 Server is running at port: ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start the server:", err.message);
    process.exit(1);
  }
};

startServer();
