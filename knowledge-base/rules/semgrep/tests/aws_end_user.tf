# ruleid: seckit.awseuc-c3.tf-appstream-default-internet
resource "aws_appstream_fleet" "open" {
  name                           = "open"
  instance_type                  = "stream.standard.small"
  enable_default_internet_access = true
}

# ok: seckit.awseuc-c3.tf-appstream-default-internet
resource "aws_appstream_fleet" "vpc" {
  name                           = "vpc"
  instance_type                  = "stream.standard.small"
  enable_default_internet_access = false
}

# ruleid: seckit.awseuc-c2.tf-workspace-unencrypted
resource "aws_workspaces_workspace" "plain" {
  directory_id = "d-123"
  bundle_id    = "wsb-123"
  user_name    = "alice"
}

# ok: seckit.awseuc-c2.tf-workspace-unencrypted
resource "aws_workspaces_workspace" "enc" {
  directory_id                   = "d-123"
  bundle_id                      = "wsb-123"
  user_name                      = "bob"
  root_volume_encryption_enabled = true
  user_volume_encryption_enabled = true
  volume_encryption_key          = "alias/aws/workspaces"
}
