# Security Group for EC2 instance
resource "aws_security_group" "oncology_app" {
  name_prefix = "oncology-app-"
  vpc_id      = local.vpc_id
  description = "Security group for oncology app EC2 instance"

  # HTTP access
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP access"
  }

  # HTTPS access
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS access"
  }

  # Application port
  ingress {
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Application port access"
  }

  # SSH access - Consider restricting this to specific IP ranges for security
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH access"
  }

  # All outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = merge(local.merged_tags, {
    Name = "oncology-app-sg"
  })
}

# IAM role for EC2 instance
resource "aws_iam_role" "ec2_role" {
  name = "oncology-app-ec2-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
  tags = local.merged_tags
}

# IAM policy for EC2 to access other AWS services
resource "aws_iam_role_policy" "ec2_policy" {
  name = "oncology-app-ec2-policy"
  role = aws_iam_role.ec2_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::pdf-embedding-bucket",
          "arn:aws:s3:::pdf-embedding-bucket/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sagemaker:InvokeEndpoint"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = "*"
      }
    ]
  })
}

# Separate CloudWatch policy for better organization
resource "aws_iam_role_policy" "ec2_cloudwatch_policy" {
  name = "oncology-app-ec2-cloudwatch-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeTags",
          "ec2:DescribeInstances"
        ]
        Resource = "*"
      }
    ]
  })
}

# Instance profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "oncology-app-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# Create CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "user_data_logs" {
  name              = "oncology-app-user-data-logs"
  retention_in_days = 7
  tags              = local.merged_tags
}

resource "aws_cloudwatch_log_group" "docker_logs" {
  name              = "oncology-app-docker-logs"
  retention_in_days = 7
  tags              = local.merged_tags
}

# Application Load Balancer
resource "aws_lb" "oncology_app" {
  name                       = "oncology-app-alb"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.oncology_app.id]
  subnets                    = data.aws_subnets.default[0].ids
  enable_deletion_protection = false

  # Enable access logs if needed (optional)
  # access_logs {
  #   bucket  = aws_s3_bucket.alb_logs.bucket
  #   prefix  = "oncology-app-alb"
  #   enabled = true
  # }

  tags = merge(local.merged_tags, {
    Name = "oncology-app-alb"
  })
}

# Enhanced Target Group with better health check
resource "aws_lb_target_group" "oncology_app" {
  name     = "oncology-app-tg"
  port     = var.app_port
  protocol = "HTTP"
  vpc_id   = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200,302" # Allow redirects as well
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 10 # Increased timeout for slower startup
    unhealthy_threshold = 3  # More tolerance for startup issues
  }

  # Deregistration delay for graceful shutdown
  deregistration_delay = 30

  # Stickiness configuration (optional)
  # stickiness {
  #   type            = "lb_cookie"
  #   cookie_duration = 86400
  #   enabled         = true
  # }

  tags = local.merged_tags
}

# Load Balancer Listener
resource "aws_lb_listener" "oncology_app" {
  load_balancer_arn = aws_lb.oncology_app.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.oncology_app.arn
  }
}

# Generate a private key
resource "tls_private_key" "ec2_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Create the key pair in AWS
resource "aws_key_pair" "ec2_key_pair" {
  key_name   = "oncology-app-key-pair" # Simplified name
  public_key = tls_private_key.ec2_key.public_key_openssh

  tags = merge(local.merged_tags, {
    Name = "oncology-app-key-pair"
  })
}

# Save the private key to AWS Systems Manager Parameter Store (recommended)
resource "aws_ssm_parameter" "ec2_private_key" {
  name  = "/oncology-app/ec2-private-key"
  type  = "SecureString"
  value = tls_private_key.ec2_key.private_key_pem
  tags = merge(local.merged_tags, {
    Name = "oncology-app-private-key"
  })
}

# Optional: Save private key to local file (less secure)
resource "local_file" "ec2_private_key" {
  content         = tls_private_key.ec2_key.private_key_pem
  filename        = "${path.module}/oncology-app-key-pair.pem" # Updated filename
  file_permission = "0400"
}

# Launch Template - FIXED
resource "aws_launch_template" "oncology_app" {
  name_prefix            = "oncology-app-"
  image_id               = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.ec2_key_pair.key_name # FIXED: Use actual key pair reference
  vpc_security_group_ids = [aws_security_group.oncology_app.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_profile.name
  }

  user_data = local.user_data

  # Enable detailed monitoring
  monitoring {
    enabled = true
  }

  # EBS optimization for better performance
  ebs_optimized = true

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.merged_tags, {
      Name = "oncology-app-instance"
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(local.merged_tags, {
      Name = "oncology-app-volume"
    })
  }

  tags = local.merged_tags
}

# Auto Scaling Group with enhanced configuration
resource "aws_autoscaling_group" "oncology_app" {
  name                      = "oncology-app-asg"
  vpc_zone_identifier       = data.aws_subnets.default[0].ids
  target_group_arns         = [aws_lb_target_group.oncology_app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300 # 5 minutes for application startup
  min_size                  = 1
  max_size                  = 3
  desired_capacity          = 1

  # Instance refresh configuration for rolling updates
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  launch_template {
    id      = aws_launch_template.oncology_app.id
    version = "$Latest"
  }

  # Termination policies
  termination_policies = ["OldestInstance"]

  tag {
    key                 = "Name"
    value               = "oncology-app-asg"
    propagate_at_launch = false
  }

  dynamic "tag" {
    for_each = local.merged_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  # Lifecycle hook for graceful shutdown (optional)
  # lifecycle {
  #   create_before_destroy = true
  # }
}
