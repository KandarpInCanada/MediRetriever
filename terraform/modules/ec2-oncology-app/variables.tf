variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where EC2 will be deployed"
  type        = string
  default     = null
}

variable "subnet_id" {
  description = "Subnet ID where EC2 will be deployed"
  type        = string
  default     = null
}

variable "docker_image" {
  description = "Docker image to deploy"
  type        = string
  default     = "kandarpincanada/oncology-app:latest"
}

variable "app_port" {
  description = "Port the application runs on"
  type        = number
  default     = 3000
}

variable "environment_variables" {
  description = "Environment variables for the Docker container"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
