# ruleid: seckit.awscmp-c1.tf-ebs-unencrypted
resource "aws_ebs_volume" "data" {
  availability_zone = "eu-west-1a"
  size              = 40
}

# ok: seckit.awscmp-c1.tf-ebs-unencrypted
resource "aws_ebs_volume" "enc" {
  availability_zone = "eu-west-1a"
  size              = 40
  encrypted         = true
}

resource "aws_instance" "web" {
  ami           = "ami-123"
  instance_type = "t3.micro"
  metadata_options {
    http_tokens = "required"
  }
  # ruleid: seckit.awscmp-c1.tf-ebs-unencrypted
  root_block_device {
    volume_size = 20
    encrypted   = false
  }
}

resource "aws_ecs_task_definition" "app" {
  family = "app"
  container_definitions = jsonencode([
    # ruleid: seckit.awscmp-c5.tf-ecs-privileged-container
    { name = "app", image = "app:1", privileged = true },
    # ok: seckit.awscmp-c5.tf-ecs-privileged-container
    { name = "side", image = "side:1", privileged = false, readonlyRootFilesystem = true },
  ])
}

resource "aws_ecs_service" "app" {
  name = "app"
  # ruleid: seckit.awscmp-c6.tf-ecs-public-ip
  network_configuration {
    subnets          = ["subnet-1"]
    assign_public_ip = true
  }
}

resource "aws_ecs_service" "private" {
  name = "private"
  # ok: seckit.awscmp-c6.tf-ecs-public-ip
  network_configuration {
    subnets          = ["subnet-1"]
    assign_public_ip = false
  }
}

# ruleid: seckit.awscmp-c7.tf-lambda-url-no-auth
resource "aws_lambda_function_url" "open" {
  function_name      = "fn"
  authorization_type = "NONE"
}

# ok: seckit.awscmp-c7.tf-lambda-url-no-auth
resource "aws_lambda_function_url" "iam" {
  function_name      = "fn"
  authorization_type = "AWS_IAM"
}

# ruleid: seckit.awscmp-c7.tf-lambda-permission-any-principal
resource "aws_lambda_permission" "any" {
  action        = "lambda:InvokeFunction"
  function_name = "fn"
  principal     = "*"
}

# ok: seckit.awscmp-c7.tf-lambda-permission-any-principal
resource "aws_lambda_permission" "apigw" {
  action        = "lambda:InvokeFunction"
  function_name = "fn"
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:eu-west-1:123456789012:abc/*"
}

resource "aws_lambda_function" "fn" {
  function_name = "fn"
  environment {
    variables = {
      # ruleid: seckit.awscmp-c4.tf-secret-in-function-env
      DB_PASSWORD = "hunter2-very-secret"
      # ok: seckit.awscmp-c4.tf-secret-in-function-env
      DB_SECRET_ARN = aws_secretsmanager_secret.db.arn
      # ok: seckit.awscmp-c4.tf-secret-in-function-env
      LOG_LEVEL = "info"
    }
  }
}

# ruleid: seckit.awscmp-c9.tf-http-listener-not-redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = "arn"
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = "arn"
  }
}

# ok: seckit.awscmp-c9.tf-http-listener-not-redirect
resource "aws_lb_listener" "redirect" {
  load_balancer_arn = "arn"
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
