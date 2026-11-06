
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
├── package.json
├── .env
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

```env
PORT=5000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
```

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
