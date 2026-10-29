resource "aws_security_group" "bad" {
  name = "web"
  # ruleid: seckit.awsacc-c10.tf-admin-port-open-to-world
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  # ok: seckit.awsacc-c10.tf-admin-port-open-to-world
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  # ok: seckit.awsacc-c10.tf-admin-port-open-to-world
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
}

# ruleid: seckit.awsacc-c10.tf-admin-port-open-to-world
resource "aws_security_group_rule" "rdp" {
  type        = "ingress"
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}

# ruleid: seckit.awsacc-c10.tf-admin-port-open-to-world
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.bad.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 3389
  to_port           = 3389
  ip_protocol       = "tcp"
}

# ruleid: seckit.awsacc-c12.tf-imdsv1-allowed
resource "aws_instance" "old" {
  ami           = "ami-123"
  instance_type = "t3.micro"
}

# ok: seckit.awsacc-c12.tf-imdsv1-allowed
resource "aws_instance" "good" {
  ami           = "ami-123"
  instance_type = "t3.micro"
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
}

# ruleid: seckit.awsacc-c6.tf-cloudtrail-weak
resource "aws_cloudtrail" "weak" {
  name           = "main"
  s3_bucket_name = "logs"
}

# ok: seckit.awsacc-c6.tf-cloudtrail-weak
resource "aws_cloudtrail" "good" {
  name                       = "main"
  s3_bucket_name             = "logs"
  is_multi_region_trail      = true
  enable_log_file_validation = true
}

# ruleid: seckit.awsacc-c9.tf-kms-rotation-off
resource "aws_kms_key" "app" {
  description = "app data"
}

# ok: seckit.awsacc-c9.tf-kms-rotation-off
resource "aws_kms_key" "rotated" {
  description         = "app data"
  enable_key_rotation = true
}

# ok: seckit.awsacc-c9.tf-kms-rotation-off
resource "aws_kms_key" "signing" {
  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
}

data "aws_iam_policy_document" "admin" {
  # ruleid: seckit.awsacc-c4.tf-iam-full-admin-policy
  statement {
    actions   = ["*"]
    resources = ["*"]
  }
  # ok: seckit.awsacc-c4.tf-iam-full-admin-policy
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::app/*"]
  }
}

resource "aws_iam_policy" "admin" {
  name = "admin"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ruleid: seckit.awsacc-c4.tf-iam-full-admin-policy
      { Effect = "Allow", Action = "*", Resource = "*" },
    ]
  })
}
