#  NovaChat 🚀

NovaChat is a premium, full-stack AI Chat assistant application featuring real-time conversational capabilities, web search integration, text-to-image generation, and robust multi-file analysis capabilities. The project is split into a robust Node.js/Express backend powered by MongoDB and a highly responsive, modern React + Vite frontend.

---

## 🌟 Key Features

### 💬 AI Chat & Conversation Management
* **Multiple LLM Integration**: Chat with current advanced open-source models using Groq:
  * **GPT OSS 120B** (`openai/gpt-oss-120b`) - Most capable reasoning model
  * **Qwen 3.6 27B** (`qwen/qwen3.6-27b`) - Fast text and vision model
  * **GPT OSS 20B** (`openai/gpt-oss-20b`) - Fast general-purpose model (Default)
* **Multimodal Vision Analysis**: Automatically switches to **Qwen 3.6 27B** (`qwen/qwen3.6-27b`) when image attachments are uploaded.
* **Mistral Integration**: Select Mistral Large, Mistral Medium, Mistral Small, or Codestral using the server-side `MISTRAL_API_KEY`.
* **Auto-Summarization**: Long conversations are summarized automatically on the backend (keeping only the last 10 messages verbatim) to prevent token overflow and optimize latency.
* **Anonymous Guest Chat**: Public playground mode that runs client-side history without requiring an account.

### 📎 Multi-File Attachments & Analysis
* **Images**: Upload up to 5 images (PNG, JPEG, WEBP) per message (max 2MB per file) for visual QA.
* **Code & Documents**: Upload up to 2 text/code documents (TXT, MD, CSV, JSON, JS, JSX, TS, TSX, CSS, HTML) per message (max 1MB per file) for automatic context injection.

### 🌐 Live Web Search
* Powered by the **Tavily Search API**.
* Real-time search queries can be toggled via the UI action menu, allowing the AI to fetch, parse, and cite up-to-date web answers.

### 🎨 Text-to-Image Generation
* Generate high-quality images directly inside the chat using prompt-based controls.
* Multiple AI generation engines:
  * **Pollinations AI** (Flux model)
  * **Hugging Face Inference API** (`black-forest-labs/FLUX.1-schnell` model)
* Built-in failover: If the primary engine fails, the app automatically switches to the alternative engine.
* Configurable daily generation limits (default: 3 images per user per day).

### 🔑 Security & Custom Configurations
* **User-Provided API Keys**: Users can securely enter their own Groq API keys. Keys are encrypted on the backend database (using AES-256-GCM) and decrypted on demand, preventing default rate limit bottlenecks. The Mistral key is configured server-side through `MISTRAL_API_KEY`.
* **JWT-Based Authentication**: Secure sign-up, login, and token verification protocols.

### 🎨 Sleek Modern UI/UX
* **Dual Theme Layout**: Sleek Dark Mode and clean Light Mode toggling (persisted locally).
* **Rich Markdown Rendering**: Seamless rendering of Markdown formats including tables, images, lists, and formatted text blocks.
* **Interactive Code Blocks**: Automatic code block formatting with syntax headers and one-click copy buttons.
* **Collapsible Navigation Sidebar**: Maximizes screen space with fluid transitions.

---

## 🛠️ Technology Stack & Tools

### Backend
* **Runtime**: Node.js
* **Framework**: Express.js
* **Database**: MongoDB (via Mongoose ODM)
* **SDKs**: `groq-sdk`
* **File Uploads**: Multer (in-memory storage parsing)
* **Scheduling**: `node-cron` (used for keep-alive pings)
* **Security & Auth**: `bcryptjs` for password hashing, `jsonwebtoken` (JWT) for secure authentication, and standard Node `crypto` for AES-256 key encryption.

### Frontend
* **Build Tool**: Vite
* **Library**: React 19
* **Styling**: Vanilla CSS (highly customized layout, variables, responsive design, animations, and dark/light variables)
* **Icons**: `lucide-react`
* **Markdown Parser**: `react-markdown`
* **HTTP Client**: Axios (configured with intercepts for JWT token injection)
* **Routing**: React Router DOM v7

---

## 📁 Project Directory Structure

```
CodeCoach/
├── backend/
│   ├── controllers/      # Route handler logic (auth, chat)
│   ├── middleware/       # JWT auth token validation
│   ├── models/           # MongoDB schemas (User, Chat, Message)
│   ├── routes/           # REST API routes
│   ├── utils/            # Cryptographic helper functions
│   ├── index.js          # Express server entrypoint
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios client instance
│   │   ├── pages/        # Main pages (Login, ChatDashboard)
│   │   ├── App.jsx       # Component router
│   │   ├── index.css     # Global core resets
│   │   └── ChatDashboard.css # Premium chat component styling
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md             # Project documentation (this file)
```

---

## ⚙️ Environment Configurations

### Backend (`/backend/.env`)
Create a `.env` file inside the `backend` folder with the following variables:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/novachat
JWT_SECRET=your_jwt_secret_key_here
CLIENT_URL=http://localhost:5173

# Optional: Separate multiple Groq API keys with commas for load-balancing
GROQ_API_KEYS=gsk_key1,gsk_key2
# Or single key:
GROQ_API_KEY=gsk_single_key

# Optional APIs
TAVILY_API_KEY=your_tavily_search_key
HF_API_KEY=your_hugging_face_key
BASE_URL=http://localhost:5000
ENCRYPTION_KEY=your_32_character_hex_encryption_key
```

### Frontend (`/frontend/.env`)
Create a `.env` file inside the `frontend` folder:
```env
VITE_API_URL=http://localhost:5000/api
```

---

## 🚀 Installation & Local Run

### Prerequisites
* **Node.js** (v18+ recommended)
* **MongoDB** (running locally or via MongoDB Atlas connection string)

### Steps

1. **Clone and Navigate**:
   ```bash
   cd CodeCoach
   ```

2. **Setup Backend**:
   ```bash
   cd backend
   npm install
   # Configure backend .env
   npm run dev
   ```
   The backend server will start on port `5000`.

3. **Setup Frontend**:
   ```bash
   cd ../frontend
   npm install
   # Configure frontend .env
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.
