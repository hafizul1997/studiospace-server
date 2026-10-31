import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`StudioSpace Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();