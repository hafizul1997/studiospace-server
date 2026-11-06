
# StudioSpace – Backend API

StudioSpace is a creative studio booking platform. This repository contains the backend REST API responsible for managing studio listings, user bookings, and application data.

## 🌐 Live API

**Backend:** https://studiospace-server-xxwa.onrender.com

**Frontend:** https://studiospace-client-t65c.vercel.app

## ✨ Key Features

- RESTful API for studio management
- Create, read, update, and delete studio listings
- User authentication with Better Auth
- Protected API routes
- Create and manage studio bookings
- Confirm or reject booking requests
- Cancel eligible bookings
- User-specific studio and booking management
- MongoDB database integration
- Environment-based configuration

## 🛠️ Technology Stack

- Node.js
- Express.js
- MongoDB
- Better Auth
- JavaScript
- REST API

## 📁 Project Structure

```text
studiospace-server/
├── index.js
├── db.js
├── auth.js
├── package.json
├── .env
├── .gitignore
└── README.md
```

## ⚙️ Installation and Setup

### Prerequisites

- Node.js
- npm
- MongoDB Atlas account or local MongoDB
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/hafizul1997/studiospace-server.git
cd studiospace-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root.


**Note:**
- `PORT`: Backend server port.
- `MONGODB_URI`: MongoDB Atlas connection string.
- `BETTER_AUTH_SECRET`: Secret key used by Better Auth.
- `CLIENT_URL`: Frontend application URL.

For production deployment, update `CLIENT_URL` with your deployed frontend URL.

Never share your actual `.env` file or secret values publicly.


Configure any additional Better Auth and Google OAuth environment variables required by your backend code.

### 4. Run the Development Server

```bash
npm run dev
```

The backend should be available at:

```text
http://localhost:5000
```

## 🔗 API Overview

## 🔗 API Documentation

Base URL:

```text
https://studiospace-server-xxwa.onrender.com
```

### Public Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Check server status |
| GET | `/api/studios` | Get all studios |
| GET | `/api/featured-studios` | Get featured studios |
| GET | `/api/studios/:id` | Get studio details |

### Protected Endpoints

These endpoints require an authenticated user session.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth-check` | Verify user authentication |
| POST | `/api/studios` | Create a new studio |
| PATCH | `/api/studios/:id` | Update a studio |
| DELETE | `/api/studios/:id` | Delete a studio |
| GET | `/api/my-listings` | Get owner's studio listings |
| POST | `/api/bookings` | Create a booking request |
| GET | `/api/my-bookings` | Get customer's bookings |
| PATCH | `/api/bookings/:id/cancel` | Cancel a pending booking |
| GET | `/api/owner-bookings` | Get owner's bookings |
| PATCH | `/api/bookings/:id/status` | Confirm or reject a booking |
| GET | `/api/notifications` | Get user notifications |
| PATCH | `/api/notifications/:id/read` | Mark a notification as read |
| PATCH | `/api/notifications/read-all` | Mark all notifications as read |

### Booking Status

- Pending
- Confirmed
- Rejected
- Cancelled

### Studio Categories

- Photo Studio
- Film Stage
- Podcast Lounge
- Music Suite
- Workshop




The backend provides API operations for:

- Studio listings
- Studio details
- User-specific listings
- Booking creation
- Booking management
- Booking cancellation
- Booking confirmation and rejection

Refer to the backend source code for the exact endpoint paths and request methods.

## 🔐 Security

- Authentication through Better Auth
- Protected backend operations
- User authorization for studio management
- Booking ownership validation
- Environment variables for sensitive configuration
- No database credentials committed to the repository

## 🚀 Deployment

- Backend Hosting: Render
- Database: MongoDB Atlas
- Frontend Integration: Vercel

## 👨‍💻 Developer

**Hafizul Islam**

- GitHub: https://github.com/hafizul1997
- Portfolio: https://hafizul-portfolio.vercel.app/
- LinkedIn: https://www.linkedin.com/in/hafizul-islam-9a86b8360/

---

⭐ Built as part of a full-stack web development project.
