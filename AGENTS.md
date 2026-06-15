# Project Instructions

- Deployment for this project is handled by GitHub Actions targeting AWS EC2.
- The deployment workflow is `.github/workflows/deploy-aws-on-tag.yml`.
- When the user says "deploy" or "部署", inspect and use the AWS EC2 workflow unless the user explicitly names another target.
