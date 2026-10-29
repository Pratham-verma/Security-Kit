resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = "assets"
  # ruleid: seckit.awssto-c1.tf-s3-public-access-block-off
  block_public_acls       = false
  # ok: seckit.awssto-c1.tf-s3-public-access-block-off
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_acl" "assets" {
  bucket = "assets"
  # ruleid: seckit.awssto-c4.tf-s3-public-acl
  acl    = "public-read"
}

resource "aws_s3_bucket_acl" "logs" {
  bucket = "logs"
  # ok: seckit.awssto-c4.tf-s3-public-acl
  acl    = "private"
}

# ruleid: seckit.awssto-c7.tf-efs-unencrypted
resource "aws_efs_file_system" "plain" {
  creation_token = "plain"
}

# ok: seckit.awssto-c7.tf-efs-unencrypted
resource "aws_efs_file_system" "enc" {
  creation_token = "enc"
  encrypted      = true
}
