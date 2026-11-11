# AWS setup and deployment

## Region and resources

The project defaults to `ap-south-1` (Mumbai). The SAM stack creates a Cognito user pool and web client, one staff group, a REST API with a Cognito authorizer, one Python Lambda, four on-demand DynamoDB tables, a private S3 site bucket, and a CloudFront distribution using origin access control. Lambda log retention is seven days. It does not create EC2 instances, a NAT gateway, or a load balancer.

The Cognito domain prefix must be unique in the selected AWS Region. Choose a lowercase prefix such as a short project name with a number appended. The password and email used by a Cognito end user are separate from the AWS account used to deploy the project.

## Create a named CLI login

The installed AWS CLI supports browser-based console sign-in. In PowerShell, run:

```powershell
aws login --profile temple-project
```

Sign in in the browser with the AWS account you intend to use. If prompted for a region, enter `ap-south-1`. Confirm the identity before deploying:

```powershell
aws sts get-caller-identity --profile temple-project
```

For an IAM Identity Center account, configure and log in with `aws configure sso --profile temple-project` and `aws sso login --profile temple-project` instead. Prefer a dedicated IAM role or Identity Center permission set for deployment. Do not create root-user access keys or use the root identity for routine deployment. Never copy a password, secret key, or session token into source files or chat.

## Install local tools

- AWS CLI v2 (already present in the current environment).
- AWS SAM CLI.
- Node.js 20.19+ or 22.12+, with npm.
- Python 3.12+ for local backend work.

## Deploy

From the repository root, run the deployment script with a profile and unique hosted-login prefix:

```powershell
./scripts/deploy.ps1 -Profile temple-project -AuthDomainPrefix smart-temple-akshit-2026
```

The script checks the selected identity, asks you to type its account ID, builds the SAM application, presents the CloudFormation changeset for review, deploys, builds the frontend with stack outputs, uploads it to the private site bucket, and invalidates CloudFront. It passes the explicit profile and region to AWS commands instead of changing the default profile.

## Add the first staff account

1. Open the deployed website and register a Cognito user with the staff member's email.
2. In the AWS console, open Cognito, select the `smart-temple` user pool for the deployed stack, open the user, and add them to the `temple-staff` group.
3. Sign out and sign in again so the refreshed ID token contains the staff group claim.

Only a staff group member can create or change schedules, search all reservations, record walk-ins, and check visitors in. Ordinary devotees can see and manage only their own reservations.

## Sample schedule

Once deployed, create a few clearly labeled demo events in the staff dashboard: two Darshan windows on one date, one recurring evening Aarti on two dates, and one full event. Do not seed fake bookings or fake dashboard metrics. Book a small group as a devotee, confirm remaining places decrease by the party size, then validate the pass once from the staff page.

## Costs and teardown

Before deployment, review the proposed CloudFormation changeset and the current AWS prices/free-tier eligibility for the selected account and Region. The stack uses on-demand/serverless services for low traffic, but usage can still incur charges. CloudFront has worldwide distribution and S3 storage/request charges; API Gateway, Lambda, Cognito, DynamoDB, and CloudWatch usage can also be billable.

To remove the project, first confirm the target profile and stack name, then delete only this project's stack:

```powershell
aws cloudformation delete-stack --stack-name smart-temple --profile temple-project --region ap-south-1
```

The site bucket is intentionally not configured to retain assets, so stack deletion removes the site as well. If bucket contents prevent deletion, inspect that named project bucket before emptying it; do not run a broad bucket deletion command.
