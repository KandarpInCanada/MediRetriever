locals {
  vpc_id    = var.vpc_id != null ? var.vpc_id : data.aws_vpc.default[0].id
  subnet_id = var.subnet_id != null ? var.subnet_id : data.aws_subnets.default[0].ids[0]
  default_tags = {
    Environment = "production"
    Project     = "oncology-app"
    ManagedBy   = "terraform"
  }
  merged_tags = merge(local.default_tags, var.tags)
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    docker_image          = var.docker_image
    app_port              = var.app_port
    environment_variables = var.environment_variables
  }))
}
