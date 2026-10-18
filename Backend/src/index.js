import dotenv from 'dotenv';
import connectDB from './db/index.js';
import { app } from './app.js';

// Load environment variables from .env file
dotenv.config({ path: './.env' });

const PORT = process.env.PORT || 5000;

// Connect to MongoDB, then start the Express server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`⚙️ Server is running at port : ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MONGO db connection failed !!! ", err);
    process.exit(1);
  });