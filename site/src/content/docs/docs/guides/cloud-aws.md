---
title: Cloud (AWS)
description: Security checks for the AWS account and services your app runs on, with AWS CLI test cases.
sidebar: { order: 2.5 }
---

Your code can be perfect and still leak data through a public S3 bucket or a database open to the internet.
The **Cloud (AWS)** part of Security Kit covers where your app runs, not just what it does.

## What it covers

| Area | What is checked |
| --- | --- |
| **AWS account** | Root user, MFA, access keys and roles, least privilege, CloudTrail, Config, GuardDuty, Security Hub, alarms, KMS key rotation, security groups, IMDSv2, VPC flow logs, Organizations SCPs, SSO |
| **Compute and web services** | EC2, AMIs and EBS, ECS and Fargate, EKS, Lambda, Elastic Beanstalk, App Runner, Lightsail, Batch, load balancers (HTTPS), secrets in user data and environment variables |
| **Storage and backups** | S3 Block Public Access, HTTPS-only buckets, encryption, versioning and Object Lock, access logs, EFS and FSx, AWS Backup with vault lock, disaster recovery drills |
| **Managed databases** | RDS and Aurora, DynamoDB, ElastiCache and MemoryDB, DocumentDB, Neptune, Keyspaces, Timestream: not public, encrypted, TLS only, IAM auth, backups, deletion protection, logs |
| **End-user computing** | Amazon WorkSpaces and AppStream 2.0: MFA, encryption, data leaving sessions, timeouts, logging |

Each control lists the CIS AWS Benchmark recommendations it relates to (for example *Foundations 2.4*).

## How to turn it on

- **In the app:** on *Describe your app*, choose **Cloud (AWS)** under *Where does it run?*, then turn on the
  parts you use and pick your services. Only the controls for those services are added. Choose Cloud on its own
  to review just an AWS account: the form then asks only about AWS. Add Web, Backend or a mobile platform to
  cover your app's code as well.
- **Automatically:** Security Kit detects AWS from Terraform (`resource "aws_…"`), CloudFormation and SAM
  templates, `serverless.yml`, AWS CDK (`cdk.json`, `aws-cdk-lib`), Elastic Beanstalk files and AWS SDK
  packages, and fills in the services it finds. An AWS SDK on its own (an app that uploads to S3, say) does not
  turn on Cloud; deployment evidence such as infrastructure code, Serverless or CDK does.
- **In `seckit.yaml`:**

  ```yaml
  app:
    name: my-app
    platforms: [backend, cloud]
  components:
    - type: aws_account
    - type: aws_compute
      services: [ecs, lambda]
      public_endpoint: true
    - type: aws_storage
      services: [s3, backup]
    - type: aws_database
      services: [rds, dynamodb]
  ```

## Test cases

Every cloud control comes with **test cases**: AWS CLI commands and the result you should see, for example

```text
aws s3control get-public-access-block --account-id <account-id>   → all four settings true
aws rds describe-db-instances --query 'DBInstances[?PubliclyAccessible==`true`].DBInstanceIdentifier'   → []
```

They appear in the checklist (under *Test cases*) and in the AI prompt. Choose **Test my app** on the AI
prompt page to get a prompt that runs every test case, changes nothing, and reports PASS / FAIL / N/A / NOT RUN
for each item. The prompt tells the AI to use **read-only** AWS commands only (`describe`, `get`, `list`) and to
fix problems in your infrastructure code, never by changing live resources.

## Automatic checks for Terraform

`seckit audit` scans Terraform files for the most common mistakes: admin ports open to the internet, IMDSv1,
unencrypted EBS, EFS, RDS and ElastiCache, public databases, public S3 ACLs or disabled public access blocks,
weak CloudTrail settings, KMS keys without rotation, `*:*` IAM policies, Lambda URLs without auth, privileged
containers, public task IPs, plain-HTTP listeners, secrets in function environments, DynamoDB without
point-in-time recovery, and WorkSpaces and AppStream settings.

The scan sees only your code. Settings made in the console are checked with the test cases above, and
AWS Security Hub (with the CIS AWS Foundations standard enabled) checks the live account continuously.

## About the CIS Benchmarks

The cloud controls are written by Security Kit and refer to CIS Benchmark recommendations by name and number
only. Security Kit is not affiliated with or endorsed by the Center for Internet Security (CIS). For the
complete benchmarks, including the full audit and remediation steps, download them free from
[cisecurity.org](https://www.cisecurity.org/benchmark/amazon_web_services).
