
import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db.js";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { auth } from "./auth.js";
import { fromNodeHeaders } from "better-auth/node";

const app = express();
const PORT = process.env.PORT || 5000;

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

app.disable("x-powered-by");

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "100kb" }));

let db;

// ======================================
// 1. Constants
// ======================================

const STUDIO_CATEGORIES = [
  "Photography Studio",
  "Music Studio",
  "Podcast Studio",
  "Video Studio",
  "Event Space",
  "Creative Workspace",
  "Other",
];

const BOOKING_STATUSES = [
  "Pending",
  "Confirmed",
  "Rejected",
  "Cancelled",
];

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 3000;
const MAX_LOCATION_LENGTH = 200;
const MAX_AMENITIES = 30;
const MAX_AMENITY_LENGTH = 60;

// ======================================
// 2. Authentication Middleware
// ======================================

const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user || !session?.user?.email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    req.user = session.user;
    req.session = session.session;

    return next();
  } catch (error) {
    console.error("Session verification error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired session.",
    });
  }
};

// ======================================
// 3. Helper Functions
// ======================================

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getUserEmail = (req) => normalizeEmail(req.user?.email);

const isValidObjectId = (id) =>
  typeof id === "string" && ObjectId.isValid(id);

const isValidString = (value, maxLength) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= maxLength;

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const isValidTime = (value) =>
  typeof value === "string" &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const isValidImageUrl = (value) => {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const parsePositiveNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return NaN;
  }

  return Number(value);
};

const sendServerError = (res, message, error) => {
  console.error(message, error);

  return res.status(500).json({
    success: false,
    message,
  });
};

// ======================================
// 4. Notification Helper
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

    return await db.collection("notifications").insertOne(notification);
  } catch (error) {
    console.error("Notification creation error:", error.message);
    return null;
  }
};

// ======================================
// 5. Studio Input Validation
// ======================================

const validateStudioFields = (data, isCreate = false) => {
  const errors = [];

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "title")
  ) {
    if (!isValidString(data.title, MAX_TITLE_LENGTH)) {
      errors.push("Title is required and must be under 120 characters.");
    }
  }

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "category")
  ) {
    if (
      typeof data.category !== "string" ||
      !STUDIO_CATEGORIES.includes(data.category.trim())
    ) {
      errors.push("Please select a valid studio category.");
    }
  }

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "hourlyRate")
  ) {
    const rate = parsePositiveNumber(data.hourlyRate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000) {
      errors.push("Hourly rate must be greater than 0.");
    }
  }

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "securityDeposit")
  ) {
    const deposit = parsePositiveNumber(data.securityDeposit);

    if (
      !Number.isFinite(deposit) ||
      deposit < 0 ||
      deposit > 10000000
    ) {
      errors.push("Security deposit must be 0 or greater.");
    }
  }

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "maxCapacity")
  ) {
    const capacity = parsePositiveNumber(data.maxCapacity);

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 10000
    ) {
      errors.push("Maximum capacity must be a positive integer.");
    }
  }

  if (
    isCreate ||
    Object.prototype.hasOwnProperty.call(data, "location")
  ) {
    if (!isValidString(data.location, MAX_LOCATION_LENGTH)) {
      errors.push("Location is required and must be under 200 characters.");
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(data, "imageUrl") ||
    isCreate
  ) {
    if (!isValidImageUrl(data.imageUrl)) {
      errors.push("Please provide a valid HTTP or HTTPS image URL.");
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(data, "description") ||
    isCreate
  ) {
    if (
      typeof data.description !== "string" ||
      data.description.trim().length > MAX_DESCRIPTION_LENGTH
    ) {
      errors.push("Description must be under 3000 characters.");
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(data, "amenities") ||
    isCreate
  ) {
    if (
      !Array.isArray(data.amenities) ||
      data.amenities.length > MAX_AMENITIES ||
      !data.amenities.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.trim().length <= MAX_AMENITY_LENGTH
      )
    ) {
      errors.push("Amenities must be a valid list of up to 30 items.");
    }
  }

  return errors;
};

// ======================================
// 6. Test Route
// ======================================

app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// ======================================
// 7. Authentication Check
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
// 8. Get All Studios (Public)
// ======================================

app.get("/api/studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    sendServerError(res, "Failed to fetch studios.", error);
  }
});

// ======================================
// 9. Get Featured Studios (Public)
// ======================================

app.get("/api/featured-studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    sendServerError(res, "Failed to fetch featured studios.", error);
  }
});

// ======================================
// 10. Get Single Studio (Public)
// ======================================

app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found.",
      });
    }

    res.status(200).json(studio);
  } catch (error) {
    sendServerError(res, "Failed to fetch studio details.", error);
  }
});

// ======================================
// 11. Add New Studio (Protected)
// ======================================

app.post("/api/studios", requireAuth, async (req, res) => {
  try {
    const errors = validateStudioFields(req.body, true);

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Invalid studio information.",
        errors,
      });
    }

    const studio = req.body;

    const studioData = {
      title: studio.title.trim(),
      category: studio.category.trim(),
      hourlyRate: Number(studio.hourlyRate),
      securityDeposit: Number(studio.securityDeposit),
      maxCapacity: Number(studio.maxCapacity),
      location: studio.location.trim(),
      imageUrl: studio.imageUrl.trim(),
      amenities: studio.amenities.map((item) => item.trim()),
      description: studio.description.trim(),

      // Owner identity comes only from authenticated session.
      ownerName: req.user.name || "",
      ownerEmail: getUserEmail(req),

      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("studios")
      .insertOne(studioData);

    res.status(201).json({
      message: "Studio created successfully.",
      insertedId: result.insertedId,
    });
  } catch (error) {
    sendServerError(res, "Failed to create studio.", error);
  }
});

// ======================================
// 12. Create Booking (Protected)
// ======================================

app.post("/api/bookings", requireAuth, async (req, res) => {
  let lockToken;
  let studioObjectId;

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

    if (!isValidObjectId(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    if (
      !isValidDate(bookingDate) ||
      !isValidTime(startTime) ||
      !isValidTime(endTime)
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

    if (
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 10000
    ) {
      return res.status(400).json({
        message: "Guest number must be a valid positive integer.",
      });
    }

    const customerEmail = getUserEmail(req);

    if (!customerEmail) {
      return res.status(401).json({
        message: "Authenticated email is unavailable.",
      });
    }

    studioObjectId = new ObjectId(studioId);

    const studio = await db.collection("studios").findOne({
      _id: studioObjectId,
      isDeleted: { $ne: true },
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

    const hourlyRate = Number(studio.hourlyRate);

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      return res.status(400).json({
        message: "Studio hourly rate is invalid.",
      });
    }

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const totalHours =
      (endHour * 60 + endMinute - (startHour * 60 + startMinute)) / 60;

    const totalPrice = totalHours * hourlyRate;

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({
        message: "Invalid booking duration or price.",
      });
    }

    // Atomic per-studio lock prevents two requests from checking
    // availability and inserting at the same time.
    lockToken = randomUUID();

    const lockResult = await db.collection("studios").updateOne(
      {
        _id: studioObjectId,
        isDeleted: { $ne: true },
        $or: [
          { bookingLockUntil: { $exists: false } },
          { bookingLockUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          bookingLockToken: lockToken,
          bookingLockUntil: new Date(Date.now() + 30000),
        },
      }
    );

    if (lockResult.modifiedCount !== 1) {
      return res.status(409).json({
        message: "This studio is currently processing another booking. Please try again.",
      });
    }

    const overlappingBooking = await db
      .collection("bookings")
      .findOne({
        studioId: String(studioId),
        bookingDate,
        status: { $in: ["Pending", "Confirmed"] },
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
      hourlyRate,
      totalPrice,
      status: "Pending",
      createdAt: new Date(),
      updatedAt: new Date(),
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
    sendServerError(res, "Failed to create booking.", error);
  } finally {
    // Release only the lock created by this request.
    if (lockToken && studioObjectId) {
      try {
        await db.collection("studios").updateOne(
          {
            _id: studioObjectId,
            bookingLockToken: lockToken,
          },
          {
            $unset: {
              bookingLockToken: "",
              bookingLockUntil: "",
            },
          }
        );
      } catch (error) {
        console.error("Booking lock release error:", error.message);
      }
    }
  }
});

// ======================================
// 13. Get My Bookings (Protected)
// ======================================

app.get("/api/my-bookings", requireAuth, async (req, res) => {
  try {
    const bookings = await db
      .collection("bookings")
      .find({ customerEmail: getUserEmail(req) })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(bookings);
  } catch (error) {
    sendServerError(res, "Failed to fetch bookings.", error);
  }
});

// ======================================
// 14. Cancel Pending Booking (Protected)
// ======================================

app.patch(
  "/api/bookings/:id/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
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
      sendServerError(res, "Failed to cancel booking.", error);
    }
  }
);

// ======================================
// 15. Get My Listings (Protected)
// ======================================

app.get("/api/my-listings", requireAuth, async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({
        ownerEmail: getUserEmail(req),
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    sendServerError(res, "Failed to fetch your listings.", error);
  }
});

// ======================================
// 16. Update Studio (Owner Only)
// ======================================

app.patch("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
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
        message: "No valid fields provided for update.",
      });
    }

    const errors = validateStudioFields(updateData);

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Invalid studio information.",
        errors,
      });
    }

    // Normalize values before saving.
    if (updateData.title !== undefined) {
      updateData.title = updateData.title.trim();
    }

    if (updateData.category !== undefined) {
      updateData.category = updateData.category.trim();
    }

    if (updateData.hourlyRate !== undefined) {
      updateData.hourlyRate = Number(updateData.hourlyRate);
    }

    if (updateData.securityDeposit !== undefined) {
      updateData.securityDeposit = Number(updateData.securityDeposit);
    }

    if (updateData.maxCapacity !== undefined) {
      updateData.maxCapacity = Number(updateData.maxCapacity);
    }

    if (updateData.location !== undefined) {
      updateData.location = updateData.location.trim();
    }

    if (updateData.imageUrl !== undefined) {
      updateData.imageUrl = updateData.imageUrl.trim();
    }

    if (updateData.description !== undefined) {
      updateData.description = updateData.description.trim();
    }

    if (updateData.amenities !== undefined) {
      updateData.amenities = updateData.amenities.map((item) => item.trim());
    }

    updateData.updatedAt = new Date();

    const result = await db.collection("studios").updateOne(
      {
        _id: new ObjectId(id),
        ownerEmail: getUserEmail(req),
        isDeleted: { $ne: true },
      },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Studio not found or you are not the owner.",
      });
    }

    res.status(200).json({
      message: "Studio updated successfully.",
    });
  } catch (error) {
    sendServerError(res, "Failed to update studio.", error);
  }
});

// ======================================
// 17. Delete Studio (Owner Only)
// Soft Delete: preserve booking history.
// ======================================

app.delete("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    const studioId = new ObjectId(id);
    const ownerEmail = getUserEmail(req);

    const result = await db.collection("studios").updateOne(
      {
        _id: studioId,
        ownerEmail,
        isDeleted: { $ne: true },
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          bookingLockToken: "",
          bookingLockUntil: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Studio not found or you are not the owner.",
      });
    }

    // Cancel pending requests so the deleted studio cannot
    // receive new booking confirmations.
    await db.collection("bookings").updateMany(
      {
        studioId: String(studioId),
        status: "Pending",
      },
      {
        $set: {
          status: "Cancelled",
          updatedAt: new Date(),
          cancellationReason: "Studio listing was deleted.",
        },
      }
    );

    res.status(200).json({
      message: "Studio deleted successfully.",
    });
  } catch (error) {
    sendServerError(res, "Failed to delete studio.", error);
  }
});

// ======================================
// 18. Get Owner Bookings (Protected)
// ======================================

app.get("/api/owner-bookings", requireAuth, async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({
        ownerEmail: getUserEmail(req),
      })
      .project({ _id: 1 })
      .toArray();

    const studioIds = studios.map((studio) => studio._id.toString());

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
    sendServerError(res, "Failed to fetch owner bookings.", error);
  }
});

// ======================================
// 19. Owner Confirms or Rejects Booking
// ======================================

app.patch(
  "/api/bookings/:id/status",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid booking ID.",
        });
      }

      if (!["Confirmed", "Rejected"].includes(status)) {
        return res.status(400).json({
          message: "Status must be Confirmed or Rejected.",
        });
      }

      const booking = await db.collection("bookings").findOne({
        _id: new ObjectId(id),
      });

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found.",
        });
      }

      if (!isValidObjectId(booking.studioId)) {
        return res.status(400).json({
          message: "Booking contains an invalid studio ID.",
        });
      }

      const studio = await db.collection("studios").findOne({
        _id: new ObjectId(booking.studioId),
        ownerEmail: getUserEmail(req),
        isDeleted: { $ne: true },
      });

      if (!studio) {
        return res.status(403).json({
          message: "You are not the owner of this active studio.",
        });
      }

      // Conditional update prevents changing an already processed booking.
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
          message: "Booking is no longer Pending.",
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
        message: `Booking ${status.toLowerCase()} successfully.`,
        status,
      });
    } catch (error) {
      sendServerError(res, "Failed to update booking status.", error);
    }
  }
);

// ======================================
// 20. Get My Notifications (Protected)
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
    sendServerError(res, "Failed to fetch notifications.", error);
  }
});

// ======================================
// 21. Mark Single Notification as Read
// ======================================

app.patch(
  "/api/notifications/:id/read",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid notification ID.",
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
          message: "Notification not found.",
        });
      }

      res.status(200).json({
        message: "Notification marked as read.",
      });
    } catch (error) {
      sendServerError(res, "Failed to update notification.", error);
    }
  }
);

// ======================================
// 22. Mark All Notifications as Read
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
        message: "All notifications marked as read.",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      sendServerError(res, "Failed to update notifications.", error);
    }
  }
);

// ======================================
// 23. JSON Error Handler
// ======================================

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON request body.",
    });
  }

  console.error("Unhandled server error:", err);

  return res.status(500).json({
    message: "Internal server error.",
  });
});

// ======================================
// 24. Start Server
// ======================================

async function startServer() {
  try {
    db = await connectDB();

    app.listen(PORT, () => {
      console.log(`StudioSpace Server running on port ${PORT}`);
      console.log(`Allowed frontend origin: ${CLIENT_URL}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
