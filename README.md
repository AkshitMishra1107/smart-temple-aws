# Smart Temple Darshan & Aarti Crowd Management

A small AWS-hosted booking and admission system for temple devotees and staff. Visitors choose General Darshan or a scheduled Aarti, see how many people can still book, reserve for their group, and receive a digital pass. Staff manage schedules, capacity, reservations, and entry.

The project is designed for a student demonstration and very low traffic. It helps make expected arrivals more predictable; it does not replace physical crowd-control procedures or promise to eliminate queues.

## Product rules

- Darshan is flexible: the site may recommend a quieter available time window.
- Aarti is tied to a named ceremony and actual scheduled occurrence. A full Aarti can suggest another occurrence, but never books it without the visitor's choice.
- Capacity is counted in people, not reservation forms. A party of five uses five places.
- The backend is the source of truth at confirmation. A full event cannot be oversold, even when two people request the last places at once.
- A QR pass refers to one reservation. Cancelled or already checked-in passes cannot admit a second group.
- The staff dashboard distinguishes reservations, walk-ins, and checked-in people.

## Project contents

- `frontend/` — devotee website and temple staff dashboard.
- `backend/` — Python AWS Lambda handlers and booking rules.
- `template.yaml` — AWS SAM infrastructure definition.
- `docs/` — product brief, UI direction, and deployment notes.
- `scripts/` — profile-safe deployment.

The full product concept is in [Smart_Temple_Product_Concept_With_AWS.pdf](Smart_Temple_Product_Concept_With_AWS.pdf).

## AWS CLI account profiles

Use a named AWS CLI profile so project commands do not depend on whichever account is set as `default`:

If you sign in to AWS directly with console credentials, the installed CLI supports browser sign-in:

```powershell
aws login --profile temple-project
aws sts get-caller-identity --profile temple-project
```

For an IAM Identity Center account, configure and log in with `aws configure sso --profile temple-project` and `aws sso login --profile temple-project` instead.

For an IAM user profile instead of IAM Identity Center, run `aws configure --profile temple-project` and enter that account's CLI credentials in the local prompts. Do not add credentials to this repository. Deployment uses `ap-south-1` (Mumbai) by default and must specify the profile explicitly.

If `aws sts get-caller-identity` prints an ARN ending in `:root`, the profile is using the account owner identity. The deploy script stops before changing AWS resources in that case. Ask the account administrator to provide a dedicated IAM Identity Center permission set or deployment role, then configure that login as a profile. Do not create root access keys.

## Local development

Requirements: Node.js 20.19+ (or 22.12+), npm, Python 3.12+, and AWS SAM CLI for AWS packaging/deployment. The frontend and backend can be edited without AWS credentials; account credentials are only needed for AWS operations.

```powershell
cd frontend
npm install
npm run dev
```

Frontend configuration is supplied through local `VITE_*` environment variables. Deployment passes stack outputs to the frontend build. Never commit local environment files.

## Deployment

See [docs/deployment.md](docs/deployment.md). Before deployment, verify the intended account with `aws sts get-caller-identity --profile <name>` and review the AWS resources and possible charges. The application intentionally avoids always-running EC2, NAT gateways, and load balancers.

## Scope

This repository contains the product code and deployment documentation. PPT and demo video production are outside this project.
