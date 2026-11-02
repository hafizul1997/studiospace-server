
import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db.js";
import { ObjectId } from "mongodb";
import { auth } from "./auth.js";
import { fromNodeHeaders } from "better-auth/node";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth already runs in Next.js.
// Express only verifies its existing session.
app.use(express.json());

let db;

// ======================================
// 1. Authentication Middleware
// ======================================

const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    req.user = session.user;
    req.session = session.session;

    next();
  } catch (error) {
    console.error("Session verification error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired session.",
    });
  }
};

// ======================================
// 2. Helper Functions
// ======================================

const normalizeEmail = (email) => {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
};

const getUserEmail = (req) => {
  return normalizeEmail(req.user?.email);
};

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
// 3. Test Route
// ======================================

app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// ======================================
// 4. Authentication Check
// ======================================

app.get("/api/auth-check", requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication successful!",
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    },
  });
});

// ======================================
// 5. Get All Studios (Public)
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
// 6. Get Featured Studios (Public)
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
// 7. Get Single Studio (Public)
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
// 8. Add New Studio (Protected)
// ======================================

app.post("/api/studios", requireAuth, async (req, res) => {
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

    const hourlyRate = Number(studio.hourlyRate);
    const securityDeposit = Number(studio.securityDeposit);
    const maxCapacity = Number(studio.maxCapacity);

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      return res.status(400).json({
        message: "Invalid hourly rate",
      });
    }

    if (
      !Number.isFinite(securityDeposit) ||
      securityDeposit < 0
    ) {
      return res.status(400).json({
        message: "Invalid security deposit",
      });
    }

    if (!Number.isInteger(maxCapacity) || maxCapacity < 1) {
      return res.status(400).json({
        message: "Invalid maximum capacity",
      });
    }

    // Never trust ownerEmail from frontend.
    const studioData = {
      title: studio.title.trim(),
      category: studio.category.trim(),
      hourlyRate,
      securityDeposit,
      maxCapacity,
      location: studio.location,
      imageUrl: studio.imageUrl,
      amenities: Array.isArray(studio.amenities)
        ? studio.amenities
        : [],
      description: studio.description,
      ownerName: req.user.name || "",
      ownerEmail: getUserEmail(req),
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
// 9. Create Booking (Protected)
// ======================================

app.post("/api/bookings", requireAuth, async (req, res) => {
  try {
    const {
      studioId,
      bookingDate,
      startTime,
      endTime,
      guests,
    } = req.body;

    if (
      !studioId ||
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

    const customerEmail = getUserEmail(req);

    if (!customerEmail) {
      return res.status(401).json({
        message: "Authenticated email is unavailable.",
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

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const totalHours = (endMinutes - startMinutes) / 60;
    const totalPrice = totalHours * Number(studio.hourlyRate);

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
        message: "This studio is already booked during that time.",
      });
    }

    const bookingData = {
      studioId: String(studioId),
      studioTitle: studio.title,
      customerName: req.user.name || "",
      customerEmail,
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

    await createNotification({
      recipientEmail: studio.ownerEmail,
      title: "New Booking Request",
      message: `${req.user.name || customerEmail} has requested to book your studio: ${studio.title}.`,
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
// 10. Get My Bookings (Protected)
// ======================================

app.get("/api/my-bookings", requireAuth, async (req, res) => {
  try {
    const customerEmail = getUserEmail(req);

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
// 11. Cancel Pending Booking (Protected)
// ======================================

app.patch(
  "/api/bookings/:id/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid booking ID.",
        });
      }

      const result = await db.collection("bookings").updateOne(
        {
          _id: new ObjectId(id),
          customerEmail: getUserEmail(req),
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
          message: "Booking not found, or booking cannot be cancelled.",
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
  }
);

// ======================================
// 12. Get My Listings (Protected)
// ======================================

app.get("/api/my-listings", requireAuth, async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ ownerEmail: getUserEmail(req) })
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
// 13. Update Studio (Owner Only)
// ======================================

app.patch("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
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
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
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

    if (updateData.hourlyRate !== undefined) {
      const rate = Number(updateData.hourlyRate);

      if (!Number.isFinite(rate) || rate <= 0) {
        return res.status(400).json({
          message: "Hourly rate must be greater than zero",
        });
      }

      updateData.hourlyRate = rate;
    }

    if (updateData.securityDeposit !== undefined) {
      const deposit = Number(updateData.securityDeposit);

      if (!Number.isFinite(deposit) || deposit < 0) {
        return res.status(400).json({
          message: "Security deposit cannot be negative",
        });
      }

      updateData.securityDeposit = deposit;
    }

    if (updateData.maxCapacity !== undefined) {
      const capacity = Number(updateData.maxCapacity);

      if (!Number.isInteger(capacity) || capacity < 1) {
        return res.status(400).json({
          message: "Maximum capacity must be a positive integer",
        });
      }

      updateData.maxCapacity = capacity;
    }

    updateData.updatedAt = new Date();

    const result = await db.collection("studios").updateOne(
      {
        _id: new ObjectId(id),
        ownerEmail: getUserEmail(req),
      },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Studio not found or you are not the owner",
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
// 14. Delete Studio (Owner Only)
// ======================================

app.delete("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const result = await db.collection("studios").deleteOne({
      _id: new ObjectId(id),
      ownerEmail: getUserEmail(req),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Studio not found or you are not the owner",
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
// 15. Get Owner Bookings (Protected)
// ======================================

app.get("/api/owner-bookings", requireAuth, async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ ownerEmail: getUserEmail(req) })
      .project({ _id: 1 })
      .toArray();

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
// 16. Owner Confirms or Rejects Booking
// ======================================

app.patch(
  "/api/bookings/:id/status",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid booking ID",
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
        ownerEmail: getUserEmail(req),
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
  }
);

// ======================================
// 17. Get My Notifications (Protected)
// ======================================

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const notifications = await db
      .collection("notifications")
      .find({ recipientEmail: getUserEmail(req) })
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
// 18. Mark Single Notification as Read
// ======================================

app.patch(
  "/api/notifications/:id/read",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid notification ID",
        });
      }

      const result = await db.collection("notifications").updateOne(
        {
          _id: new ObjectId(id),
          recipientEmail: getUserEmail(req),
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
  }
);

// ======================================
// 19. Mark All Notifications as Read
// ======================================

app.patch(
  "/api/notifications/read-all",
  requireAuth,
  async (req, res) => {
    try {
      const result = await db.collection("notifications").updateMany(
        {
          recipientEmail: getUserEmail(req),
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
  }
);

// ======================================
// 20. Start Server
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
