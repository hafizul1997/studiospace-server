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

// Create a new booking
app.post("/api/bookings", async (req, res) => {
  try {
    const {
      studioId,
      customerName,
      customerEmail,
      bookingDate,
      startTime,
      endTime,
      guests,
    } = req.body;

    // 1. Validate required fields
    if (
      !studioId ||
      !customerName?.trim() ||
      !customerEmail?.trim() ||
      !bookingDate ||
      !startTime ||
      !endTime ||
      guests === undefined
    ) {
      return res.status(400).json({
        message: "Please provide all required booking information.",
      });
    }

    // 2. Validate Studio ID
    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    // 3. Validate date and time formats
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(bookingDate);
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!validDate || !validTime.test(startTime) || !validTime.test(endTime)) {
      return res.status(400).json({
        message: "Invalid booking date or time.",
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        message: "End time must be later than start time.",
      });
    }

    if (!Number.isInteger(guests) || guests < 1) {
      return res.status(400).json({
        message: "Guest number must be at least 1.",
      });
    }
// Get bookings for a specific customer
app.get("/api/my-bookings", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "Customer email is required.",
      });
    }

    const bookings = await db
      .collection("bookings")
      .find({
        customerEmail: email.trim().toLowerCase(),
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(bookings);
  } catch (error) {
    console.error("My bookings error:", error);

    res.status(500).json({
      message: "Failed to fetch bookings.",
    });
  }
});
    // 4. Find the Studio
    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found.",
      });
    }

    if (guests > Number(studio.maxCapacity)) {
      return res.status(400).json({
        message: `Maximum capacity is ${studio.maxCapacity} people.`,
      });
    }

    // 5. Calculate booking duration and price
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const totalHours = (endMinutes - startMinutes) / 60;
    const totalPrice = totalHours * Number(studio.hourlyRate);

    // 6. Check overlapping bookings
    const overlappingBooking = await db.collection("bookings").findOne({
      studioId,
      bookingDate,
      status: { $nin: ["Cancelled"] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });

    if (overlappingBooking) {
      return res.status(409).json({
        message: "This studio is already booked during that time.",
      });
    }

    // 7. Save booking in MongoDB
    const bookingData = {
      studioId,
      studioTitle: studio.title,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      bookingDate,
      startTime,
      endTime,
      guests,
      totalHours,
      hourlyRate: Number(studio.hourlyRate),
      totalPrice,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(bookingData);

    // 8. Send response
    res.status(201).json({
      message: "Booking request submitted successfully!",
      bookingId: result.insertedId,
      booking: bookingData,
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).json({
      message: "Failed to create booking.",
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