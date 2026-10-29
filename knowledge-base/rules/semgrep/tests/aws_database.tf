# ruleid: seckit.awsdb-c1.tf-db-publicly-accessible, seckit.awsdb-c2.tf-db-unencrypted
resource "aws_db_instance" "public" {
  engine              = "postgres"
  instance_class      = "db.t4g.micro"
  publicly_accessible = true
  # ruleid: seckit.awsdb-c4.tf-db-literal-password
  password            = "SuperSecret123"
}

# ok: seckit.awsdb-c1.tf-db-publicly-accessible, seckit.awsdb-c2.tf-db-unencrypted
resource "aws_db_instance" "private" {
  engine                      = "postgres"
  instance_class              = "db.t4g.micro"
  publicly_accessible         = false
  storage_encrypted           = true
  # ok: seckit.awsdb-c4.tf-db-literal-password
  manage_master_user_password = true
}

# ok: seckit.awsdb-c2.tf-db-unencrypted
resource "aws_db_instance" "replica" {
  replicate_source_db = aws_db_instance.private.identifier
  instance_class      = "db.t4g.micro"
}

# ruleid: seckit.awsdb-c2.tf-cache-unencrypted
resource "aws_elasticache_replication_group" "plain" {
  replication_group_id = "plain"
  description          = "cache"
}

# ok: seckit.awsdb-c2.tf-cache-unencrypted
resource "aws_elasticache_replication_group" "enc" {
  replication_group_id       = "enc"
  description                = "cache"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# ruleid: seckit.awsdb-c5.tf-dynamodb-no-pitr
resource "aws_dynamodb_table" "orders" {
  name     = "orders"
  hash_key = "id"
}

# ok: seckit.awsdb-c5.tf-dynamodb-no-pitr
resource "aws_dynamodb_table" "users" {
  name     = "users"
  hash_key = "id"
  point_in_time_recovery {
    enabled = true
  }
}
