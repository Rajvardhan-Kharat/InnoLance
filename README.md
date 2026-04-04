# InnoLance - Auto-AI Freelancing Platform

Welcome to the **OwnWork** repository! This project is a modern, feature-rich freelancing and project management platform built to streamline the entire lifecycle of enterprise client projects. Acting under the company name **InnoLance**, this platform bridges the gap between massive Enterprise RFPs (Request for Proposals) and individual freelancers by leveraging AI and automation.

## 🚀 Tech Stack

**Frontend:**
- React.js (Vite)
- React Router DOM
- Socket.io Client (Real-time updates)
- Stripe Elements (Payments)
- Axios

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose
- Google Gemini AI (`@google/generative-ai`)
- Socket.io (WebSockets)
- IMAP Flow & Mailparser (Email listening)
- JWT & Bcrypt (Authentication)
- Stripe API

---

## ✨ Features As Of Now

1. **Automated Enterprise RFP Intake**
   - Built-in IMAP email listener automatically ingests Product Requirements Documents (PRDs) and RFPs sent to a dedicated corporate email inbox.
   
2. **AI-Powered PRD Breakdown**
   - Integrates **Google Gemini AI** to automatically parse massive, complex PRDs. The AI intelligently breaks them down into smaller, actionable micro-deliverables and tasks.

3. **Real-time Admin Operations**
   - Real-time updates delivered instantly via **Socket.io**. The Admin dashboard gets live notifications immediately when a new RFP email is received and processed.

4. **InnoLance Admin Management Workflow**
   - The Admin assumes the identity of **InnoLance**, managing the overarching client relationship. Admins can review, modify, and assemble the AI-generated task lists before pushing them to the public freelancer marketplace.

5. **Freelancer Bidding & Proposals**
   - Freelancers can view available micro-tasks, submit bids, and write proposals. The Admin acts as the ultimate decider on assigning these micro-tasks.

6. **Secure Wallet & Payments**
   - Integrated with **Stripe** to handle milestone-based payments, escrow, and freelancer wallets securely.

7. **Role-based Access Control**
   - Distinct roles (Admin, Client, Freelancer) securely managed using JWT authentication to ensure strict data privacy and workflow enforcement.

---

## 🔮 What We Can Add More (Future Roadmap)

Here are several high-impact features we can build next to make the platform even more powerful:

1. **AI-Driven Proposal Scoring**
   - *Idea:* Use Gemini AI to automatically evaluate and rank incoming freelancer proposals based on the project’s requirements, saving the Admin hours of manual review.

2. **In-App Messaging & Video Interviews**
   - *Idea:* Integrate WebRTC for native video/audio calls or real-time chat so clients, admins, and freelancers can negotiate and conduct interviews without leaving the app.

3. **Advanced Project Management (Gantt/Kanban)**
   - *Idea:* Add visual task tracking, Gantt charts, and Kanban boards on both the Admin and Freelancer sides to visually map out task dependencies of massive RFPs.

4. **Automated Code/Skill Verification**
   - *Idea:* Integrate a sandboxed coding environment or quiz system to automatically test a freelancer's skills before they are allowed to bid on premium InnoLance tasks.

5. **OAuth / Social Logins**
   - *Idea:* Allow quick onboarding through LinkedIn, GitHub, or Google to reduce friction during sign-ups.

6. **Automated Dispute Resolution Center**
   - *Idea:* Create a structured mediating workflow where AI initially attempts to resolve discrepancies based on agreed milestones before escalating to a human admin.

7. **Financial Analytics & Reporting Dashboard**
   - *Idea:* A dedicated view for InnoLance admins to track company-wide ROI, active escrow balances, platform fees, and monthly revenue metrics.

---

## 🛠️ Getting Started Locally

### Prerequisites
- Node.js (v18+)
- MongoDB (Running locally or via Atlas)
- Appropriate Environment Variables (Gemini API, Stripe, IMAP Email Credentials)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Rajvardhan-Kharat/InnoLance.git
   cd project2
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Start the Platform (Development Mode):**
   - Term 1: `cd backend && npm run dev`
   - Term 2: `cd frontend && npm run dev`

---

*Built with ❤️ for modern freelancer orchestration.*
