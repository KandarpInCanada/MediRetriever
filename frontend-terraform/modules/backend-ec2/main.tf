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

# User data script for Backend EC2 instance
locals {
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    docker_image                 = var.docker_image
    cloudwatch_log_group         = var.cloudwatch_log_group
    aws_region                   = data.aws_region.current.name
    name_prefix                  = var.name_prefix
    sagemaker_llm_endpoint       = var.sagemaker_llm_endpoint
    sagemaker_embedding_endpoint = var.sagemaker_embedding_endpoint
    aws_access_key_id            = var.aws_access_key_id
    aws_secret_access_key        = var.aws_secret_access_key
    pinecone_api_key             = var.pinecone_api_key
    pinecone_index_name          = var.pinecone_index_name
  }))
}

# Backend EC2 Instance
resource "aws_instance" "backend" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = var.security_group_ids
  subnet_id              = var.private_subnet_id
  iam_instance_profile   = var.instance_profile_name

  user_data                   = local.user_data
  user_data_replace_on_change = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-backend-server"
    Type = "Backend"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Data source for current AWS region
data "aws_region" "current" {}
