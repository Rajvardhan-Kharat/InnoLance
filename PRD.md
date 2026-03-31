# Product Requirements Document (PRD): Freelance Platform

This folder contains the implementation of the freelancing platform (WorkBridge) based on the PRD template you provided. The build is phased.

## Executive Summary

- **Purpose**: Connect freelancers with clients, enable secure project posting and bidding, and provide messaging and reviews.
- **Objectives**: User registration (client/freelancer), project posting and proposals, messaging, reviews, and (later) payments and escrow.
- **Stakeholders**: Product, development, design, clients, freelancers.

## Product Vision and Scope

- **Vision**: A trusted, global platform for freelance work with clear workflows and secure payments.
- **Scope (current)**:
  - User roles: Admin, Client, Freelancer
  - Registration, profiles, project CRUD, proposals, messaging, reviews
- **Out of scope (this version)**: Payment processing, video calls, full CMS, mobile apps.

## Implemented Features (Phase 1)

1. **User roles and permissions**: Admin, Client, Freelancer (JWT + role-based routes).
2. **User registration and profiles**: Email/password signup, profile edit, public freelancer profile with skills and reviews.
3. **Project posting and bidding**: Clients post (fixed/hourly), freelancers submit proposals; accept/reject flow.
4. **Matching and discovery**: Browse and search projects by category and text.
5. **Communication**: Conversations and messages (REST API; real-time can be added later).
6. **Review and rating**: Mutual reviews after project completion (backend + UI hooks).
7. **Security**: JWT, password hashing, protected routes, CORS.

## Technical Stack

- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT, express-validator.
- **Frontend**: React 18, Vite, React Router, Axios.
- **Database**: MongoDB.

## Roadmap

- **Phase 1 (done)**: MVP as above.
- **Phase 2**: Milestones, recommendations, notifications.
- **Phase 3**: Stripe, escrow, time tracking, admin CMS.

