# Smart Temple Booking System Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Build a simple AWS-hosted application where devotees reserve Darshan or Aarti visits and temple staff manage capacity, bookings, and check-ins.

**Architecture:** Use a React/TypeScript single-page website on S3 and CloudFront, Cognito for devotee and staff accounts, API Gateway and Python Lambda for application operations, and DynamoDB for events, bookings, and check-ins. Define AWS resources in SAM; deploy only through an explicitly named and identity-checked AWS CLI profile.

**Tech Stack:** React, TypeScript, Vite, Python, AWS SAM, Amazon Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, CloudWatch.

**Spec:** `Smart_Temple_Product_Concept_With_AWS.pdf` (especially sections 1-8, 11-24).

## Global Constraints

- Keep the interface straightforward and usable on mobile; avoid decorative or high-maintenance features.
- Treat Darshan as flexible time-window demand and Aarti as a named, fixed-time event; never silently substitute dates or ceremonies.
- Count capacity in people, including every person in a group booking.
- A confirmed reservation must never exceed a slot's configured capacity, including concurrent requests.
- Only the booking owner can view or cancel their reservations; only staff can manage schedules or validate admission.
- QR passes are for one booking and event; cancelled or already checked-in passes cannot be admitted again.
- Keep walk-in admissions within the same configured overall capacity and distinguish reserved visitors from checked-in visitors.
- Do not create always-on EC2, NAT gateways, or load balancers for this low-traffic student project.
- Do not put credentials, access keys, personal contact details, or real visitor data in source control.
- Do not deploy until the chosen named AWS profile returns the intended account identity.
- Use `ap-south-1` (Mumbai) as the deployment region unless the target account or an explicit user preference requires another region.
- No PPT or demo video is part of this implementation.

## Review Focus

- Requests for more people than remain must be refused without partial or excess reservations.
- Aarti recommendations must refer only to actual scheduled occurrences of that ceremony.
- Repeated confirmation and repeated QR scans must not create duplicate bookings or admissions.
- Staff-only schedule and check-in operations must reject devotee accounts.
- Cancelled, closed, and past events must not accept new reservations.

## Planned File Structure

- `README.md`, `.gitignore`, and `docs/` — project setup, product scope, AWS profile use, deployment and operating notes.
- `template.yaml` — SAM resources, API routes, Cognito configuration, DynamoDB tables, static hosting, and log retention.
- `backend/src/` — Python Lambda handlers, booking rules, recommendations, staff authorization, and data access.
- `backend/events/` — API Gateway event examples used for local invocation and documentation.
- `frontend/src/` — devotee booking/account flows, staff dashboard, API client, and shared components.
- `frontend/public/` — static site assets, including a small project mark if needed.
- `scripts/` — optional sample schedule seeding and deployment helpers that require an explicit profile.

---

### Task 1: Establish the repository and the first real Git commit

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Keep: `Smart_Temple_Product_Concept_With_AWS.pdf`
- Create: root folders from the planned file structure as implementation begins.

- Initialize Git in the existing project folder before creating application code.
- Put the supplied product brief and a short README in the first commit; exclude credentials, local build output, and environment files.
- Use a meaningful initial commit, then make later commits for completed milestones rather than manufacturing history afterward.

### Task 2: Define the serverless foundation and account-safe deployment path

**Files:**
- Create: `template.yaml`
- Create: `backend/requirements.txt`
- Create: `docs/deployment.md`
- Create: `scripts/deploy.ps1`

- Define Cognito user pool/groups, API Gateway, Lambda execution roles, DynamoDB tables, S3/CloudFront hosting, and bounded CloudWatch log retention in SAM.
- Keep permission scopes small: devotee operations are owner-scoped; management and check-in operations require the staff group.
- Make deployment require an explicit `-Profile` and target region; print and confirm the STS account identity before resource changes.
- Document the SSO profile path and the access-key profile path without recording credentials.

### Task 3: Implement schedules, availability, and reservations

**Files:**
- Create: `backend/src/handlers/events.py`
- Create: `backend/src/handlers/bookings.py`
- Create: `backend/src/domain/availability.py`
- Create: `backend/src/domain/reservations.py`
- Create: `backend/src/data/dynamo.py`

- Model a Darshan window separately from a dated, named Aarti occurrence.
- Add staff operations to create, edit, close, and cancel schedule items and set capacities/group-size limits.
- Add devotee operations to list available schedules, request a reservation, list owned reservations, and cancel when policy allows.
- Deduct capacity by attendee count in the same conditional/transactional operation that records a booking; treat client retries as the same intent where practical.
- Recommend the nearest lower-demand Darshan window for flexible visits; for Aarti, recommend only an actual future occurrence of that Aarti with enough capacity for the whole group.
- Return clear conflict responses when capacity changes between display and confirmation.

### Task 4: Add account roles, digital passes, and check-in

**Files:**
- Create: `backend/src/auth/permissions.py`
- Create: `backend/src/handlers/checkins.py`
- Create: `backend/src/domain/passes.py`
- Modify: `template.yaml`

- Require authenticated Cognito identities for personal bookings and use the staff group for schedule management and check-in.
- Issue a unique booking reference and QR payload that resolves through the API to the authoritative booking status; do not place private visitor data in the QR payload.
- Validate event/date/status at check-in, mark the booking once, and make repeat scans visibly report already checked in.
- Record staff-authorized walk-in attendance separately while enforcing the configured overall limit.

### Task 5: Build the devotee experience

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/index.html`
- Create: `frontend/src/app/`
- Create: `frontend/src/features/booking/`
- Create: `frontend/src/features/account/`
- Create: `frontend/src/lib/api.ts`
- Modify: `template.yaml`

- Build responsive signup/login, Darshan/Aarti selection, date/time availability, group-size entry, explicit recommendation acceptance, confirmation, QR pass, and booking history/cancellation views.
- Show availability in people, make full options unselectable, and explain why an alternative is recommended.
- Keep language plain, keep the booking summary visible before confirmation, and distinguish confirmed reservations from suggestions.

### Task 6: Build the temple staff dashboard

**Files:**
- Create: `frontend/src/features/staff/`
- Modify: `frontend/src/lib/api.ts`
- Modify: backend staff handlers as required by the defined API.

- Build staff-only views for reservations, schedule/capacity controls, event closure, booking lookup, pass validation, and authorized walk-in recording.
- Show real totals for reserved people, checked-in people, remaining capacity, and walk-ins; label the definitions and never use hard-coded metrics.
- Keep staff actions available on smaller screens, with clear confirmation for closing an event or changing capacity.

### Task 7: Connect deployment, seed a small demo schedule, and document handoff

**Files:**
- Create: `scripts/seed_demo_data.py`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `template.yaml`

- Document region, named-profile use, setup, account roles, the demo walkthrough, resource teardown, and the costs to check before deployment.
- Seed only clearly labeled sample schedules and capacities; do not insert fabricated reservations or dashboard totals.
- Publish the repository to GitHub only after reviewing repository visibility and confirming no credentials or personal data are included.
- Deploy AWS resources only after the target profile identity and planned resource/cost summary are confirmed.

## Scope Notes

- Initial scope includes user signup/login, staff permissions, Darshan and Aarti bookings, recommendations, capacity enforcement, booking history, digital passes, check-in, schedule management, and live dashboard metrics.
- A cancellation waiting list, SMS reminders, payment, AI forecasting, a virtual queue, exit sensors, and multi-temple administration are out of scope.
- Implementation work must not create or run automated tests unless the user asks for testing or verification; this plan does not add test files.
