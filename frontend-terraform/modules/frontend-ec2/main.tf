# Data source for latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# User data script for Frontend EC2 instance
locals {
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    docker_image         = var.docker_image
    backend_api_url      = var.backend_api_url
    cloudwatch_log_group = var.cloudwatch_log_group
    aws_region           = data.aws_region.current.name
    name_prefix          = var.name_prefix
  }))
}

# Frontend EC2 Instance
resource "aws_instance" "frontend" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = var.security_group_ids
  subnet_id              = var.public_subnet_ids[0]
  iam_instance_profile   = var.instance_profile_name

  user_data                   = local.user_data
  user_data_replace_on_change = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-frontend-server"
    Type = "Frontend"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Elastic IP for the Frontend instance
resource "aws_eip" "frontend" {
  instance = aws_instance.frontend.id
  domain   = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-frontend-eip"
  })

  depends_on = [aws_instance.frontend]
}

# Data source for current AWS region
data "aws_region" "current" {}
