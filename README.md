# 🎵 Music Analyzer

Music Analyzer is a full-stack web application built with Next.js and Python, featuring Spotify integration. This project allows users to log in with their Spotify accounts, fetch music data, and analyze tracks through a custom Python audio engine.

## ✨ Features

- **Spotify Integration:** User authentication and access to playlist/track data using the Spotify API.
- **Advanced Audio Analysis:** Detailed analysis and processing of tracks with a Python-based (`audio-engine`) background engine.
- **Modern and Fast UI:** Responsive and elegant design built with Next.js (App Router), React, and Tailwind CSS.
- **Secure Authentication:** Secure and seamless user session management with NextAuth.js.
- **Database Management:** Efficient data modeling and storage with Prisma ORM.

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes (Node.js)
- **Audio Engine:** Python (`main.py`)
- **Database:** Prisma ORM
- **Authentication:** NextAuth.js (Spotify Provider)
- **Tools:** ESLint, PostCSS

## 📂 Project Structure

```text
music-analyzer/
├── app/                  # Next.js App Router folder (pages, layouts, css)
│   ├── api/auth/         # NextAuth.js API routes
│   ├── api/analyze/      # Audio analysis API endpoints
│   └── fonts/            # Custom font files (Aquire)
├── audio-engine/         # Python-based audio analysis engine
│   └── main.py           # Main entry file for the analysis engine
├── components/           # Reusable React components (e.g., Providers.tsx)
├── lib/                  # Utility functions (spotify.ts, prisma.ts, etc.)
├── prisma/               # Prisma schema file and configuration
└── public/               # Static files (SVG, ICO, etc.)
```

## 🚀 Setup and Installation

Follow these steps to run the project in your local environment:

### 1. Prerequisites
- Node.js (v18+)
- Python (v3.8+)
- Spotify Developer account (App must be created)

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/music-analyzer.git
cd music-analyzer
```

### 3. Install Dependencies
Install Node packages:
```bash
npm install
# or yarn / pnpm / bun
```

### 4. Set Environment Variables
Create a `.env` file in the root directory and fill in the following variables with your own data:

```env
# Database
DATABASE_URL="file:./dev.db" # (For SQLite example, or your PostgreSQL/MySQL URL)

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate_a_random_security_key_here"

# Spotify API
SPOTIFY_CLIENT_ID="spotify_developer_dashboard_client_id"
SPOTIFY_CLIENT_SECRET="spotify_developer_dashboard_client_secret"
```

### 5. Prepare the Database
Apply the Prisma schema to the database and generate the client:
```bash
npx prisma generate
npx prisma db push
```

### 6. Prepare the Python Environment
Install the necessary dependencies for the audio engine:
```bash
cd audio-engine
# If you have a requirements file, install it
# pip install -r requirements.txt
cd ..
```

### 7. Start the Development Server
Run the application:
```bash
npm run dev
```
You can view the application by navigating to [http://localhost:3000](http://localhost:3000) in your browser.

## 📝 License
This project is licensed under the [MIT License](LICENSE).
