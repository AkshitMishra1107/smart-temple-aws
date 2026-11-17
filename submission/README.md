# Smart Temple Project Submission

Smart Temple is an AWS application for reserving Darshan and Aarti visits and recording admissions. The visitor and staff screens share the same application and sign-in page.

## Submission files

| Requirement | File or location |
| --- | --- |
| Project proposal | [Project Proposal.pdf](Project%20Proposal.pdf) |
| Architecture and booking transaction | [System Architecture.pdf](System%20Architecture.pdf), 2 pages |
| Working implementation | [Smart Temple website](https://089raq8mha.execute-api.ap-south-1.amazonaws.com/prod/) |
| AWS deployment | CloudFormation stack `smart-temple` in Mumbai (`ap-south-1`) |
| Source code and deployment instructions | [Smart Temple GitHub repository](https://github.com/AkshitMishra1107/smart-temple-aws) |
| Project report | [Project Report.pdf](Project%20Report.pdf), 4 pages |
| Final presentation | [Smart Temple AWS Walkthrough.pptx](Smart%20Temple%20AWS%20Walkthrough.pptx), 10 slides |
| Live demonstration | [Live Demonstration Guide.pdf](Live%20Demonstration%20Guide.pdf) |
| Combined narrated walkthrough | [Smart Temple Combined Demo.mp4](Smart%20Temple%20Combined%20Demo.mp4), 4 minutes 31 seconds |

## Open the source repository

Clone the GitHub repository after signing in with an authorized account.

```powershell
git clone https://github.com/AkshitMishra1107/smart-temple-aws.git smart-temple
cd smart-temple
```

The repository README explains the code, run commands, and deployment. The AWS settings and deployment procedure are in `template.yaml` and `docs/deployment.md`.

## Staff access

Register and verify an email on the live site. The AWS account owner can add the verified Cognito user to the `temple-staff` group. After signing in again, open **Staff desk**, choose **Add a visit time**, and enter the schedule and capacity. For a live check-in demonstration, use a new slot that starts within 30 minutes.

## Recorded demonstration

The video follows the Sunset Darshan slot from publication to a family's QR pass. It also shows the visitor selecting the 1 December Sandhya Aarti occurrence, which has two online places for a party of three. The portal recommends the linked 2 December occurrence at the same time. The visitor chooses the suggestion and confirms the booking.

The deployed portal and AWS Management Console appear side by side. Staff open the schedule editor, update capacity, close and reopen online bookings, and search for and cancel a test reservation. The video records the rejection for an early pass or walk-in attempt. An in-window session is needed to film successful check-in, repeat-pass rejection, and walk-in admission.

An AWS administrator confirmed the synthetic visitors. The test reservations were cancelled after filming to restore capacity.

The labeled demo listings stay on the visitor schedule until their respective start times, in India Standard Time.

| Demo listing | Date in December 2026 | Start time | Online places | Walk-in places |
| --- | --- | --- | --- | --- |
| Sandhya Aarti | 1 December | 8:30 p.m. | 2 | 6 |
| Sunset Darshan | 2 December | 5:30 p.m. | 12 | 8 |
| Evening Darshan | 2 December | 6:45 p.m. | 12 | 8 |
| Evening Aarti | 2 December | 7:45 p.m. | 16 | 4 |
| Sandhya Aarti | 2 December | 8:30 p.m. | 16 | 4 |
