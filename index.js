
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

// ======================================
// Helper 1: Normalize Email
// ======================================

const normalizeEmail = (email) => {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
};

// ======================================
// Helper 2: Create Notification
// ======================================

const createNotification = async ({
  recipientEmail,
  title,
  message,
  type,
  bookingId,
  studioId,
}) => {
  try {
    const email = normalizeEmail(recipientEmail);

    if (!email) return null;

    const notification = {
      recipientEmail: email,
      title,
      message,
      type,
      bookingId: String(bookingId),
      studioId: String(studioId),
      isRead: false,
      createdAt: new Date(),
    };

    return await db
      .collection("notifications")
      .insertOne(notification);
  } catch (error) {
    console.error("Notification creation error:", error);
    return null;
  }
};

// ======================================
// 1. Test Route
// ======================================

app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// ======================================
// 2. Get All Studios
// ======================================

app.get("/api/studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    console.error("Get studios error:", error);

    res.status(500).json({
      message: "Failed to fetch studios",
    });
  }
});

// ======================================
// 3. Get Featured Studios
// ======================================

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

// ======================================
// 4. Get Single Studio Details
// ======================================

app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

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
    });
  }
});

// ======================================
// 5. Add New Studio
// ======================================

app.post("/api/studios", async (req, res) => {
  try {
    const studio = req.body;

    if (
      typeof studio.title !== "string" ||
      !studio.title.trim() ||
      typeof studio.category !== "string" ||
      !studio.category.trim()
    ) {
      return res.status(400).json({
        message: "Title and category are required",
      });
    }

    const ownerEmail = normalizeEmail(studio.ownerEmail);

    if (!ownerEmail) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const studioData = {
      ...studio,
      title: studio.title.trim(),
      category: studio.category.trim(),
      ownerEmail,
      createdAt: new Date(),
    };

    const result = await db
      .collection("studios")
      .insertOne(studioData);

    res.status(201).json({
      message: "Studio created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add studio error:", error);

    res.status(500).json({
      message: "Failed to create studio",
    });
  }
});

// ======================================
// 6. Create New Booking
// ======================================

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

    if (
      !studioId ||
      typeof customerName !== "string" ||
      !customerName.trim() ||
      typeof customerEmail !== "string" ||
      !customerEmail.trim() ||
      !bookingDate ||
      !startTime ||
      !endTime ||
      guests === undefined
    ) {
      return res.status(400).json({
        message: "Please provide all required booking information.",
      });
    }

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    const normalizedCustomerEmail =
      normalizeEmail(customerEmail);

    if (!normalizedCustomerEmail) {
      return res.status(400).json({
        message: "Valid customer email is required.",
      });
    }

    const validDate = /^\d{4}-\d{2}-\d{2}$/;
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (
      !validDate.test(bookingDate) ||
      !validTime.test(startTime) ||
      !validTime.test(endTime)
    ) {
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

    if (
      !Number.isFinite(Number(studio.hourlyRate)) ||
      Number(studio.hourlyRate) <= 0
    ) {
      return res.status(400).json({
        message: "Studio hourly rate is invalid.",
      });
    }

    const [startHour, startMinute] = startTime
      .split(":")
      .map(Number);

    const [endHour, endMinute] = endTime
      .split(":")
      .map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const totalHours =
      (endMinutes - startMinutes) / 60;

    const totalPrice =
      totalHours * Number(studio.hourlyRate);

    // Check overlapping bookings
    const overlappingBooking = await db
      .collection("bookings")
      .findOne({
        studioId: String(studioId),
        bookingDate,
        status: {
          $nin: ["Cancelled", "Rejected"],
        },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      });

    if (overlappingBooking) {
      return res.status(409).json({
        message:
          "This studio is already booked during that time.",
      });
    }

    const bookingData = {
      studioId: String(studioId),
      studioTitle: studio.title,
      customerName: customerName.trim(),
      customerEmail: normalizedCustomerEmail,
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

    const result = await db
      .collection("bookings")
      .insertOne(bookingData);

    // Notify Studio Owner
    await createNotification({
      recipientEmail: studio.ownerEmail,
      title: "New Booking Request",
      message: `${customerName.trim()} has requested to book your studio: ${studio.title}.`,
      type: "booking_request",
      bookingId: result.insertedId,
      studioId: studio._id,
    });

    res.status(201).json({
      message: "Booking request submitted successfully!",
      bookingId: result.insertedId,
      booking: {
        ...bookingData,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).json({
      message: "Failed to create booking.",
    });
  }
});

// ======================================
// 7. Get My Bookings
// ======================================

app.get("/api/my-bookings", async (req, res) => {
  try {
    const customerEmail = normalizeEmail(req.query.email);

    if (!customerEmail) {
      return res.status(400).json({
        message: "Customer email is required.",
      });
    }

    const bookings = await db
      .collection("bookings")
      .find({ customerEmail })
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

// ======================================
// 8. Cancel Pending Booking
// ======================================

app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.email);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID.",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Customer email is required.",
      });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        customerEmail: email,
        status: "Pending",
      },
      {
        $set: {
          status: "Cancelled",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message:
          "Booking not found, or booking cannot be cancelled.",
      });
    }

    res.status(200).json({
      message: "Booking cancelled successfully!",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    res.status(500).json({
      message: "Failed to cancel booking.",
    });
  }
});

// ======================================
// 9. Get My Listings
// ======================================

app.get("/api/my-listings", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const studios = await db
      .collection("studios")
      .find({ ownerEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    console.error("My listings error:", error);

    res.status(500).json({
      message: "Failed to fetch your listings",
    });
  }
});

// ======================================
// 10. Update Studio
// ======================================

app.patch("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ownerEmail, ...updates } = req.body;

    const email = normalizeEmail(ownerEmail);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const allowedFields = [
      "title",
      "category",
      "hourlyRate",
      "securityDeposit",
      "maxCapacity",
      "location",
      "imageUrl",
      "amenities",
      "description",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided for update",
      });
    }

    if (
      updateData.title !== undefined &&
      (typeof updateData.title !== "string" ||
        !updateData.title.trim())
    ) {
      return res.status(400).json({
        message: "Studio title is invalid",
      });
    }

    if (
      updateData.hourlyRate !== undefined &&
      (!Number.isFinite(Number(updateData.hourlyRate)) ||
        Number(updateData.hourlyRate) <= 0)
    ) {
      return res.status(400).json({
        message: "Hourly rate must be greater than zero",
      });
    }

    if (
      updateData.securityDeposit !== undefined &&
      (!Number.isFinite(Number(updateData.securityDeposit)) ||
        Number(updateData.securityDeposit) < 0)
    ) {
      return res.status(400).json({
        message: "Security deposit cannot be negative",
      });
    }

    if (
      updateData.maxCapacity !== undefined &&
      (!Number.isInteger(Number(updateData.maxCapacity)) ||
        Number(updateData.maxCapacity) < 1)
    ) {
      return res.status(400).json({
        message:
          "Maximum capacity must be a positive integer",
      });
    }

    updateData.updatedAt = new Date();

    const result = await db.collection("studios").updateOne(
      {
        _id: new ObjectId(id),
        ownerEmail: email,
      },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message:
          "Studio not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Studio updated successfully",
    });
  } catch (error) {
    console.error("Update studio error:", error);

    res.status(500).json({
      message: "Failed to update studio",
    });
  }
});

// ======================================
// 11. Delete Studio
// ======================================

app.delete("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.ownerEmail);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const result = await db.collection("studios").deleteOne({
      _id: new ObjectId(id),
      ownerEmail: email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message:
          "Studio not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Studio deleted successfully",
    });
  } catch (error) {
    console.error("Delete studio error:", error);

    res.status(500).json({
      message: "Failed to delete studio",
    });
  }
});

// ======================================
// 12. Get Owner Bookings
// ======================================

app.get("/api/owner-bookings", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const studios = await db
      .collection("studios")
      .find({ ownerEmail: email })
      .project({ _id: 1 })
      .toArray();

    // Booking studioId is stored as String
    const studioIds = studios.map((studio) =>
      studio._id.toString()
    );

    if (studioIds.length === 0) {
      return res.status(200).json([]);
    }

    const bookings = await db
      .collection("bookings")
      .find({
        studioId: { $in: studioIds },
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Owner bookings error:", error);

    res.status(500).json({
      message: "Failed to fetch owner bookings",
    });
  }
});

// ======================================
// 13. Owner Confirms or Rejects Booking
// ======================================

app.patch("/api/bookings/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.ownerEmail);
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    if (!["Confirmed", "Rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be Confirmed or Rejected",
      });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(id),
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    if (!ObjectId.isValid(booking.studioId)) {
      return res.status(400).json({
        message: "Booking contains an invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(booking.studioId),
      ownerEmail: email,
    });

    if (!studio) {
      return res.status(403).json({
        message: "You are not the owner of this studio",
      });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        status: "Pending",
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        message: "Booking is no longer Pending",
      });
    }

    // Notify Customer
    await createNotification({
      recipientEmail: booking.customerEmail,
      title:
        status === "Confirmed"
          ? "Booking Confirmed"
          : "Booking Rejected",
      message:
        status === "Confirmed"
          ? `Your booking for ${booking.studioTitle} has been confirmed.`
          : `Your booking for ${booking.studioTitle} has been rejected.`,
      type:
        status === "Confirmed"
          ? "booking_confirmed"
          : "booking_rejected",
      bookingId: booking._id,
      studioId: booking.studioId,
    });

    res.status(200).json({
      message: `Booking ${status.toLowerCase()} successfully`,
      status,
    });
  } catch (error) {
    console.error("Update booking status error:", error);

    res.status(500).json({
      message: "Failed to update booking status",
    });
  }
});

// ======================================
// 14. Get My Notifications
// ======================================

app.get("/api/notifications", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const notifications = await db
      .collection("notifications")
      .find({ recipientEmail: email })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);

    res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
});

// ======================================
// 15. Mark Single Notification as Read
// ======================================

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.email);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const result = await db.collection("notifications").updateOne(
      {
        _id: new ObjectId(id),
        recipientEmail: email,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.status(200).json({
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark notification read error:", error);

    res.status(500).json({
      message: "Failed to update notification",
    });
  }
});

// ======================================
// 16. Mark All Notifications as Read
// ======================================

app.patch("/api/notifications/read-all", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const result = await db.collection("notifications").updateMany(
      {
        recipientEmail: email,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications error:", error);

    res.status(500).json({
      message: "Failed to update notifications",
    });
  }
});

// ======================================
// 17. Start Server
// ======================================

async function startServer() {
  try {
    db = await connectDB();

    app.listen(PORT, () => {
      console.log(
        `StudioSpace Server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
