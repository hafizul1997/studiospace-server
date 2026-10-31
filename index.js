import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db.js";
import { ObjectId } from "mongodb";
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let db;

// Test route
app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// Get all studios
app.get("/api/studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find()
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studios",
    });
  }
});
//get data from mongodb 
app.get("/api/featured-studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find()
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    console.error("Featured studios error:", error);

    res.status(500).json({
      message: "Failed to fetch featured studios",
    });
  }
});
//Details page api with create id
app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Requested Studio ID:", id);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

    console.log("Studio found:", studio);

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    res.status(200).json(studio);

  } catch (error) {
    console.error("Get studio details error:", error);

    res.status(500).json({
      message: "Failed to fetch studio details",
      error: error.message,
    });
  }
});


// Add a new studio
app.post("/api/studios", async (req, res) => {
  try {
    const studio = req.body;

    if (!studio.title || !studio.category) {
      return res.status(400).json({
        message: "Title and category are required",
      });
    }

    const result = await db
      .collection("studios")
      .insertOne({
        ...studio,
        createdAt: new Date(),
      });

    res.status(201).json({
      message: "Studio created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create studio",
    });
  }
});

// Start server after connecting to MongoDB
async function startServer() {
  try {
    db = await connectDB();

    app.listen(PORT, () => {
      console.log(`StudioSpace Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();