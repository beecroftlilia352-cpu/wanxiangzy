# Project Instructions

- Production deployment is performed from the local Mac with
  `scripts/deploy-from-local.sh <tag> [worker_instances]` targeting AWS EC2.
- Build `.next` locally; never run `next build` on the memory-constrained EC2 host.
- `.github/workflows/deploy-aws-on-tag.yml` is a manual fallback only and must
  not deploy automatically when a tag is pushed.
- New generated visual assets must be uploaded to Aliyun OSS under the configured `ALIYUN_OSS_SITE_ASSET_PREFIX`; application code should reference the public OSS URL. Do not add generated image or video binaries to `public/` or other website source directories.
