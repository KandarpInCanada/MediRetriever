# CloudWatch Log Group for Frontend Application Logs
resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/aws/ec2/${var.name_prefix}/frontend"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-frontend-logs"
  })
}

# CloudWatch Log Group for Backend Application Logs
resource "aws_cloudwatch_log_group" "backend_logs" {
  name              = "/aws/ec2/${var.name_prefix}/backend"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-backend-logs"
  })
}

# CloudWatch Log Group for System Logs
resource "aws_cloudwatch_log_group" "system_logs" {
  name              = "/aws/ec2/${var.name_prefix}/system"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-system-logs"
  })
}

# CloudWatch Log Group for Docker Logs
resource "aws_cloudwatch_log_group" "docker_logs" {
  name              = "/aws/ec2/${var.name_prefix}/docker"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-docker-logs"
  })
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.app_logs.name}' | fields @timestamp, @message | sort @timestamp desc | limit 100"
          region = data.aws_region.current.name
          title  = "Frontend Application Logs"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.backend_logs.name}' | fields @timestamp, @message | sort @timestamp desc | limit 100"
          region = data.aws_region.current.name
          title  = "Backend Application Logs"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 12
        height = 6

        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.docker_logs.name}' | fields @timestamp, @message | sort @timestamp desc | limit 100"
          region = data.aws_region.current.name
          title  = "Docker Logs"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 18
        width  = 12
        height = 6

        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.system_logs.name}' | fields @timestamp, @message | sort @timestamp desc | limit 100"
          region = data.aws_region.current.name
          title  = "System Logs"
        }
      }
    ]
  })
}

# Data source for current AWS region
data "aws_region" "current" {}
