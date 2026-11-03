
import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db.js";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { auth } from "./auth.js";
import { fromNodeHeaders } from "better-auth/node";

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

let db;

// ======================================
// 1. Security Configuration
// ======================================

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

// Reject unexpected content types for JSON API requests.
// GET requests without a body are not affected.
app.use((req, res, next) => {
  if (
    ["POST", "PATCH", "PUT"].includes(req.method) &&
    req.path.startsWith("/api/") &&
    req.headers["content-type"] &&
    !req.is("application/json")
  ) {
    return res.status(415).json({
      success: false,
      message: "Content-Type must be application/json.",
    });
  }

  next();
});

// ======================================
// 2. Constants
// ======================================

const STUDIO_CATEGORIES = [
  "Photo Studio",
  "Film Stage",
  "Podcast Lounge",
  "Music Suite",
  "Workshop",
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
const MAX_IMAGE_URL_LENGTH = 2048;

const BOOKING_LOCK_DURATION = 30000;

// ======================================
// 3. General Helpers
// ======================================

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getUserEmail = (req) => normalizeEmail(req.user?.email);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const isValidObjectId = (id) =>
  typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);

const isValidString = (value, maxLength) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= maxLength;

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

const isValidDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
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
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_IMAGE_URL_LENGTH
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const sendServerError = (res, message, error) => {
  console.error(message, error);

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
};

const getDateTimeMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// ======================================
// 4. Authentication Middleware
// ======================================

const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user?.id || !session?.user?.email) {
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
// 5. Studio Validation
// ======================================

const validateStudioFields = (data, isCreate = false) => {
  const errors = [];

  if (!isPlainObject(data)) {
    return ["Request body must be a valid JSON object."];
  }

  if (isCreate || hasOwn(data, "title")) {
    if (!isValidString(data.title, MAX_TITLE_LENGTH)) {
      errors.push("Title is required and must be under 120 characters.");
    }
  }

  if (isCreate || hasOwn(data, "category")) {
    if (
      typeof data.category !== "string" ||
      !STUDIO_CATEGORIES.includes(data.category.trim())
    ) {
      errors.push("Please select a valid studio category.");
    }
  }

  if (isCreate || hasOwn(data, "hourlyRate")) {
    const rate = parsePositiveNumber(data.hourlyRate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000) {
      errors.push("Hourly rate must be greater than 0.");
    }
  }

  if (isCreate || hasOwn(data, "securityDeposit")) {
    const deposit = parsePositiveNumber(data.securityDeposit);

    if (
      !Number.isFinite(deposit) ||
      deposit < 0 ||
      deposit > 10000000
    ) {
      errors.push("Security deposit must be 0 or greater.");
    }
  }

  if (isCreate || hasOwn(data, "maxCapacity")) {
    const capacity = parsePositiveNumber(data.maxCapacity);

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 10000
    ) {
      errors.push("Maximum capacity must be a positive integer.");
    }
  }

  if (isCreate || hasOwn(data, "location")) {
    if (!isValidString(data.location, MAX_LOCATION_LENGTH)) {
      errors.push("Location is required and must be under 200 characters.");
    }
  }

  if (isCreate || hasOwn(data, "imageUrl")) {
    if (!isValidImageUrl(data.imageUrl)) {
      errors.push("Please provide a valid HTTP or HTTPS image URL.");
    }
  }

  if (isCreate || hasOwn(data, "description")) {
    if (
      typeof data.description !== "string" ||
      data.description.trim().length > MAX_DESCRIPTION_LENGTH
    ) {
      errors.push("Description must be under 3000 characters.");
    }
  }

  if (isCreate || hasOwn(data, "amenities")) {
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
// 6. Notification Helper
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
// 7. Basic Routes
// ======================================

app.get("/", (req, res) => {
  res.status(200).send("StudioSpace Server is Running!");
});

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
        success: false,
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

      // Never trust owner information from the frontend.
      ownerId: req.user.id,
      ownerName: req.user.name || "",
      ownerEmail: getUserEmail(req),

      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("studios").insertOne(studioData);

    return res.status(201).json({
      success: true,
      message: "Studio created successfully.",
      insertedId: result.insertedId,
    });
  } catch (error) {
    return sendServerError(res, "Failed to create studio.", error);
  }
});

// ======================================
// 12. Create Booking (Protected)
// ======================================

app.post("/api/bookings", requireAuth, async (req, res) => {
  let lockToken;
  let studioObjectId;

  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        message: "Invalid request body.",
      });
    }

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

    // This booking system does not support overnight bookings.
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

    // Compare booking date using server UTC date.
    // Configure the server timezone/business timezone consistently.
    const today = new Date().toISOString().slice(0, 10);

    if (bookingDate < today) {
      return res.status(400).json({
        message: "You cannot book a date in the past.",
      });
    }

    const customerEmail = getUserEmail(req);

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

    if (studio.ownerEmail === customerEmail) {
      return res.status(403).json({
        message: "You cannot book your own studio.",
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

    const startMinutes = getDateTimeMinutes(startTime);
    const endMinutes = getDateTimeMinutes(endTime);

    const totalHours = (endMinutes - startMinutes) / 60;
    const totalPrice = totalHours * hourlyRate;

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({
        message: "Invalid booking duration or price.",
      });
    }

    // Acquire a per-studio temporary lock.
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
          bookingLockUntil: new Date(
            Date.now() + BOOKING_LOCK_DURATION
          ),
        },
      }
    );

    if (lockResult.modifiedCount !== 1) {
      return res.status(409).json({
        message: "This studio is processing another booking. Please try again.",
      });
    }

    // Check time overlap.
    const overlappingBooking = await db.collection("bookings").findOne({
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
      customerId: req.user.id,
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

    const result = await db.collection("bookings").insertOne(bookingData);

    await createNotification({
      recipientEmail: studio.ownerEmail,
      title: "New Booking Request",
      message: `${req.user.name || customerEmail} has requested to book your studio: ${studio.title}.`,
      type: "booking_request",
      bookingId: result.insertedId,
      studioId: studio._id,
    });

    return res.status(201).json({
      success: true,
      message: "Booking request submitted successfully!",
      bookingId: result.insertedId,
      booking: {
        ...bookingData,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    return sendServerError(res, "Failed to create booking.", error);
  } finally {
    // Release only this request's lock.
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
    const bookings = await db.collection("bookings")
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

app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
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
});

// ======================================
// 15. Get My Listings (Protected)
// ======================================

app.get("/api/my-listings", requireAuth, async (req, res) => {
  try {
    const studios = await db.collection("studios")
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

    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        message: "Invalid request body.",
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
      if (hasOwn(req.body, field)) {
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
      updateData.amenities = updateData.amenities.map((item) =>
        item.trim()
      );
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
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Studio not found or you are not the owner.",
      });
    }

    // Cancel pending bookings for this studio.
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
    const studios = await db.collection("studios")
      .find({
        ownerEmail: getUserEmail(req),
      })
      .project({ _id: 1 })
      .toArray();

    const studioIds = studios.map((studio) => studio._id.toString());

    if (studioIds.length === 0) {
      return res.status(200).json([]);
    }

    const bookings = await db.collection("bookings")
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
// ============================================
// 19. Owner Confirms or Rejects Booking
// ============================================

app.patch("/api/bookings/:id/status", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 1. Validate booking ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    // 2. Validate requested status
    if (!["Confirmed", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Confirmed or Rejected.",
      });
    }

    // 3. Find booking
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(id),
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // 4. Validate studio ID
    if (!ObjectId.isValid(booking.studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID in booking.",
      });
    }

    // 5. Verify that the logged-in user owns this studio
    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(booking.studioId),
      ownerEmail: getUserEmail(req),
      isDeleted: { $ne: true },
    });

    if (!studio) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this booking.",
      });
    }

    // 6. Update only if booking is still Pending
    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        studioId: booking.studioId,
        status: "Pending",
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "This booking has already been processed.",
      });
    }

    // 7. Create customer notification
    await db.collection("notifications").insertOne({
      recipientEmail: booking.customerEmail,
      title: `Booking ${status}`,
      message:
        status === "Confirmed"
          ? `Your booking for ${studio.studioName || "the studio"} has been confirmed.`
          : `Your booking for ${studio.studioName || "the studio"} has been rejected.`,
      type: "booking",
      bookingId: id,
      studioId: booking.studioId,
      isRead: false,
      createdAt: new Date(),
    });

    // 8. Send response
    return res.status(200).json({
      success: true,
      message: `Booking ${status.toLowerCase()} successfully.`,
      status,
    });
  } catch (error) {
    console.error("Update Booking Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
});
// ======================================
// 20. Get My Notifications (Protected)
// ======================================

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const notifications = await db.collection("notifications")
      .find({
        recipientEmail: getUserEmail(req),
      })
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

app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
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
});

// ======================================
// 22. Mark All Notifications as Read
// ======================================

app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
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
});

// ======================================
// 23. Not Found Handler
// ======================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// ======================================
// 24. Error Handler
// ======================================

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    });
  }

  console.error("Unhandled server error:", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// ======================================
// 25. Start Server
// ======================================

async function startServer() {
  try {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error("BETTER_AUTH_SECRET is missing.");
    }

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing.");
    }

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
